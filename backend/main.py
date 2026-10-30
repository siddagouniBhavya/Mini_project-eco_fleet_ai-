import itertools
import json
import math
import tempfile
import time
import uuid
from pathlib import Path
from datetime import timedelta

import searoute as sr
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from models import (
    FuelPredictionRequest,
    ShipmentRequest,
    OptimizationRequest,
    MultiShipmentOptimizationRequest,
    Vessel,
)
from prediction import predict_fuel
from planner import (
    optimize_baseline,
    calculate_candidate_metrics,
    calculate_travel_time_hours,
    calculate_repositioning_metrics
)
from fitness import calculate_green_scores
from qio.optimizer import optimize_qiga, generate_speed_strategies
from ga.optimizer import optimize_ga
from fleet.import_session import (
    create_import_session,
    get_import_session,
    delete_import_session,
)
from fleet.service import (
    read_fleet_file,
    analyze_uploaded_columns,
    transform_records,
    process_vessels,
)


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="EcoFleet AI API",
    description="AI-powered maritime fleet optimization system",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

VESSELS_FILE = BASE_DIR / "data" / "vessels.json"
SHIPMENTS_FILE = BASE_DIR / "data" / "shipments.json"
PORTS_FILE = BASE_DIR / "ports.json"

# Joint allocation uses exact vessel-subset enumeration.
# Keep the search bounded until a scalable solver is introduced.
MAX_JOINT_ALLOCATION_VESSELS = 12


# ============================================================
# GENERAL HELPERS
# ============================================================

def load_vessels():
    """Load vessels from the local JSON fleet database."""
    if not VESSELS_FILE.exists():
        return []

    with open(VESSELS_FILE, "r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, list):
        raise ValueError("Vessel database must contain a JSON list.")

    return data


def save_vessels(vessels):
    """Save vessels to the local JSON fleet database."""
    VESSELS_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(VESSELS_FILE, "w", encoding="utf-8") as file:
        json.dump(vessels, file, indent=2)


def load_shipments():
    """Load persistent shipment and voyage records."""
    if not SHIPMENTS_FILE.exists():
        return []

    with open(SHIPMENTS_FILE, "r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, list):
        raise ValueError("Shipment database must contain a JSON list.")

    return data


def save_shipments(shipments):
    """Save persistent shipment and voyage records."""
    SHIPMENTS_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(SHIPMENTS_FILE, "w", encoding="utf-8") as file:
        json.dump(shipments, file, indent=2)


def validate_and_clean_vessel(vessel_data):
    """Validate a vessel using the Pydantic model."""
    vessel = Vessel.model_validate(vessel_data)
    return vessel.model_dump(mode="json")


def get_available_vessels():
    """Return vessels currently marked AVAILABLE."""
    return [
        vessel
        for vessel in load_vessels()
        if str(vessel.get("status", "")).strip().upper()
        == "AVAILABLE"
    ]


def load_ports():
    """Load and validate the port dataset."""
    if not PORTS_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail="Port dataset not found",
        )

    try:
        with open(PORTS_FILE, "r", encoding="utf-8") as file:
            ports = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Could not read port dataset",
        ) from exc

    if not isinstance(ports, list):
        raise HTTPException(
            status_code=500,
            detail="Port dataset must contain a list of ports",
        )

    return ports


def build_ports_by_code(ports):
    """Build an uppercase UN/LOCODE-to-port lookup."""
    return {
        str(port.get("code", "")).strip().upper(): port
        for port in ports
        if isinstance(port, dict) and port.get("code")
    }


def calculate_sea_route(origin_port, destination_port, shipment_index=None):
    """Calculate and validate the sea route in kilometres."""
    prefix = (
        f"Shipment {shipment_index}: "
        if shipment_index is not None
        else ""
    )

    try:
        origin_coords = [
            float(origin_port["longitude"]),
            float(origin_port["latitude"]),
        ]
        destination_coords = [
            float(destination_port["longitude"]),
            float(destination_port["latitude"]),
        ]

        route = sr.searoute(
            origin_coords,
            destination_coords,
            units="km",
            append_orig_dest=True,
            algorithm="astar",
            return_passages=True,
        )

        distance_km = float(route.properties["length"])
        geometry = route.geometry

        if not math.isfinite(distance_km) or distance_km <= 0:
            raise ValueError("Invalid sea-route distance.")

        if not isinstance(geometry, dict):
            raise ValueError("Invalid route geometry.")

        if geometry.get("type") != "LineString":
            raise ValueError("Expected LineString route geometry.")

        coordinates = geometry.get("coordinates", [])

        if not isinstance(coordinates, list) or len(coordinates) < 2:
            raise ValueError("Route must contain at least two coordinates.")

        if route.properties.get("traversed_passages") is None:
            raise ValueError("Route passage metadata is missing.")

        return round(distance_km, 2), geometry

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"{prefix}Sea route validation failed: {exc}",
        ) from exc
# ============================================================
# JOINT ALLOCATION HELPERS
# ============================================================

def joint_ga_objective(candidate):
    """
    Calculate the same weighted logarithmic objective used by GA.
    Lower scores are preferred.
    """
    metrics = candidate["metrics"]

    cost = max(0.0, float(metrics["total_cost"]))
    emissions = max(0.0, float(metrics["total_ghg_kg"]))
    travel_time = max(
        0.0,
        float(metrics["travel_time_hours"]),
    )

    return (
        0.50 * math.log1p(cost)
        + 0.30 * math.log1p(emissions)
        + 0.20 * math.log1p(travel_time)
    )


def enumerate_joint_shipment_plans(
    vessels,
    cargo_demand_tons,
    distance_km,
    deadline_hours,
    environment=None,
    scoring_policy="QIGA",
):
    """
    Enumerate feasible vessel subsets and fleet-level speed strategies.

    Returns:
        plans,
        deadline-capable vessels,
        maximum combined capacity among deadline-capable vessels.

    Feasibility uses the current planner assumption that every selected
    vessel must meet the shipment deadline individually.
    """
    deadline_capable_vessels = []

    for vessel in vessels:
        try:
            maximum_speed = float(vessel["max_speed_mps"])
            capacity = float(vessel["capacity_tons"])
        except (KeyError, TypeError, ValueError):
            continue

        if (
            not math.isfinite(maximum_speed)
            or not math.isfinite(capacity)
            or maximum_speed <= 0
            or capacity <= 0
        ):
            continue

        fastest_time = calculate_travel_time_hours(
            distance_km=distance_km,
            speed_mps=maximum_speed,
        )

        if (
            math.isfinite(fastest_time)
            and fastest_time <= deadline_hours
        ):
            deadline_capable_vessels.append(vessel)

    maximum_deadline_capacity = sum(
        float(vessel["capacity_tons"])
        for vessel in deadline_capable_vessels
    )

    if maximum_deadline_capacity < cargo_demand_tons:
        return [], deadline_capable_vessels, maximum_deadline_capacity

    if len(deadline_capable_vessels) > MAX_JOINT_ALLOCATION_VESSELS:
        raise ValueError(
            "Joint allocation supports at most "
            f"{MAX_JOINT_ALLOCATION_VESSELS} deadline-capable vessels "
            "per shipment."
        )

    raw_candidates = []

    for fleet_size in range(
        1,
        len(deadline_capable_vessels) + 1,
    ):
        for fleet_tuple in itertools.combinations(
            deadline_capable_vessels,
            fleet_size,
        ):
            fleet = list(fleet_tuple)

            total_capacity = sum(
                float(vessel["capacity_tons"])
                for vessel in fleet
            )

            if total_capacity < cargo_demand_tons:
                continue

            for strategy_name, speeds in generate_speed_strategies(fleet):
                metrics = calculate_candidate_metrics(
                    vessels=fleet,
                    speeds=speeds,
                    distance_km=distance_km,
                    cargo_demand_tons=cargo_demand_tons,
                    environment=environment,
                )

                if not metrics.get("feasible", False):
                    continue

                try:
                    travel_time = float(metrics["travel_time_hours"])
                    metric_values = [
                        float(metrics[key])
                        for key in (
                            "total_cost",
                            "total_ghg_kg",
                            "total_fuel_kg",
                            "travel_time_hours",
                        )
                    ]
                except (KeyError, TypeError, ValueError):
                    continue

                if (
                    not math.isfinite(travel_time)
                    or travel_time > deadline_hours
                    or not all(math.isfinite(value) for value in metric_values)
                ):
                    continue

                raw_candidates.append({
                    "vessel_ids": [
                        vessel["vessel_id"]
                        for vessel in fleet
                    ],
                    "speed_strategy": strategy_name,
                    "metrics": metrics,
                })

    if not raw_candidates:
        return (
            [],
            deadline_capable_vessels,
            maximum_deadline_capacity,
        )

    if scoring_policy == "QIGA":
        scored_candidates = calculate_green_scores(raw_candidates)

        for candidate in scored_candidates:
            candidate["_joint_score"] = float(
                candidate["fitness"]["green_score"]
            )
    else:
        scored_candidates = raw_candidates

        for candidate in scored_candidates:
            candidate["_joint_score"] = joint_ga_objective(candidate)

    scored_candidates.sort(
        key=lambda candidate: candidate["_joint_score"]
    )

    return (
        scored_candidates,
        deadline_capable_vessels,
        maximum_deadline_capacity,
    )


def joint_state_is_better(candidate, incumbent):
    """
    Compare batch allocations using these priorities:
      1. Maximize shipments served.
      2. Prefer tighter deadlines when the number served is tied.
      3. Minimize combined objective score.
      4. Prefer fewer vessels.
      5. Use input order as a deterministic tie-break.
    """
    if incumbent is None:
        return True

    if candidate["served_count"] != incumbent["served_count"]:
        return candidate["served_count"] > incumbent["served_count"]

    if not math.isclose(
        candidate["priority_total"],
        incumbent["priority_total"],
        rel_tol=1e-12,
        abs_tol=1e-12,
    ):
        return candidate["priority_total"] > incumbent["priority_total"]

    if not math.isclose(
        candidate["score_total"],
        incumbent["score_total"],
        rel_tol=1e-12,
        abs_tol=1e-12,
    ):
        return candidate["score_total"] < incumbent["score_total"]

    if candidate["vessel_count"] != incumbent["vessel_count"]:
        return candidate["vessel_count"] < incumbent["vessel_count"]

    candidate_signature = tuple(
        0 if plan is not None else 1
        for plan in candidate["assignments"]
    )
    incumbent_signature = tuple(
        0 if plan is not None else 1
        for plan in incumbent["assignments"]
    )

    return candidate_signature < incumbent_signature


def joint_allocate_plans(shipment_contexts, vessel_bit_by_id):
    """
    Dynamic programming over vessel bitmasks.

    Each state represents the vessel IDs already allocated.
    A vessel cannot be assigned to more than one shipment.
    """
    states = {
        0: {
            "served_count": 0,
            "priority_total": 0.0,
            "score_total": 0.0,
            "vessel_count": 0,
            "assignments": [],
        }
    }

    for context in shipment_contexts:
        next_states = {}

        deadline = float(context["shipment"].deadline_hours)
        priority = 1.0 / deadline

        for used_mask, state in states.items():
            # Option A: leave the shipment unassigned.
            skipped = {
                "served_count": state["served_count"],
                "priority_total": state["priority_total"],
                "score_total": state["score_total"],
                "vessel_count": state["vessel_count"],
                "assignments": state["assignments"] + [None],
            }

            incumbent = next_states.get(used_mask)

            if joint_state_is_better(skipped, incumbent):
                next_states[used_mask] = skipped

            # Option B: allocate a feasible plan whose vessels are unused.
            for plan in context["plans"]:
                plan_mask = 0

                for vessel_id in plan["vessel_ids"]:
                    plan_mask |= vessel_bit_by_id[vessel_id]

                if used_mask & plan_mask:
                    continue

                combined_mask = used_mask | plan_mask

                assigned = {
                    "served_count": state["served_count"] + 1,
                    "priority_total": state["priority_total"] + priority,
                    "score_total": (
                        state["score_total"] + plan["_joint_score"]
                    ),
                    "vessel_count": (
                        state["vessel_count"] + len(plan["vessel_ids"])
                    ),
                    "assignments": state["assignments"] + [plan],
                }

                incumbent = next_states.get(combined_mask)

                if joint_state_is_better(assigned, incumbent):
                    next_states[combined_mask] = assigned

        states = next_states

    best_state = None

    for state in states.values():
        if joint_state_is_better(state, best_state):
            best_state = state

    if best_state is None:
        return [None] * len(shipment_contexts)

    return best_state["assignments"]

TURNAROUND_HOURS = 6.0
TIME_AWARE_BEAM_WIDTH = 200
MAX_PLANS_PER_SHIPMENT = 300


def _get_joint_plan_duration_hours(plan):
    """Read voyage duration from a candidate plan."""
    metrics = plan.get("metrics", {})

    possible_keys = (
        "total_travel_time_hours",
        "travel_time_hours",
        "total_travel_time",
        "travel_time",
    )

    for key in possible_keys:
        value = metrics.get(key)
        if value is not None:
            value = float(value)
            if math.isfinite(value) and value > 0:
                return value

    for key in possible_keys:
        value = plan.get(key)
        if value is not None:
            value = float(value)
            if math.isfinite(value) and value > 0:
                return value

    raise ValueError(
        "Candidate plan is missing a valid voyage duration. "
        "Check the duration field returned by calculate_candidate_metrics()."
    )







def joint_allocate_time_aware_plans(
    shipment_items,
    plans_by_shipment,
    shipment_contexts,
    vessel_records,
    ports_by_code,
    turnaround_hours=TURNAROUND_HOURS,
    beam_width=TIME_AWARE_BEAM_WIDTH,
    max_plans_per_shipment=MAX_PLANS_PER_SHIPMENT,
    scoring_policy="QIGA",
    return_alternatives=False,
    max_alternatives=2,
):
    """
    Joint scheduling with vessel locations, repositioning, turnaround,
    and repositioning fuel/cost/GHG included in the objective.

    Returns the best allocation as a dictionary mapping zero-based
    shipment indexes to selected plans.
    """
    from datetime import datetime, timedelta

    if not (
        len(shipment_items)
        == len(plans_by_shipment)
        == len(shipment_contexts)
    ):
        raise ValueError(
            "Shipment items, plans, and contexts must have equal lengths."
        )

    if max_alternatives < 1:
        raise ValueError("max_alternatives must be positive.")

    if not shipment_items:
        return [] if return_alternatives else {}

    if any(item.departure_time is None for item in shipment_items):
        raise ValueError(
            "Every shipment needs departure_time for time-aware scheduling."
        )

    if (
        turnaround_hours < 0
        or beam_width < 1
        or max_plans_per_shipment < 1
    ):
        raise ValueError(
            "Turnaround must be non-negative and search limits must be positive."
        )

    vessels_by_id = {
        str(vessel["vessel_id"]): vessel
        for vessel in vessel_records
        if vessel.get("vessel_id") is not None
    }

    def parse_location_time(value, vessel_id, departure):
        if value is None:
            raise ValueError(
                f"Vessel {vessel_id} has current_port_locode but no "
                "location_updated_at. Record a timezone-aware location timestamp."
            )

        if isinstance(value, datetime):
            parsed = value
        else:
            try:
                parsed = datetime.fromisoformat(
                    str(value).replace("Z", "+00:00")
                )
            except ValueError as exc:
                raise ValueError(
                    f"Vessel {vessel_id} has an invalid location_updated_at."
                ) from exc

        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError(
                f"Vessel {vessel_id} location timestamp must include "
                "a timezone offset."
            )

        return parsed

    def get_plan_vessel_metrics(plan):
        entries = plan.get("metrics", {}).get("vessels", [])
        if not isinstance(entries, list):
            entries = []

        return {
            str(entry["vessel_id"]): entry
            for entry in entries
            if isinstance(entry, dict)
            and entry.get("vessel_id") is not None
        }

    def calculate_adjusted_score(metrics):
        candidate = {"metrics": metrics}

        if scoring_policy == "QIGA":
            scored = calculate_green_scores([candidate])[0]
            return (
                float(scored["fitness"]["green_score"]),
                scored["fitness"],
            )

        ga_score = (
            0.50 * math.log1p(
                max(float(metrics["total_cost"]), 0.0)
            )
            + 0.30 * math.log1p(
                max(float(metrics["total_ghg_kg"]), 0.0)
            )
            + 0.20 * math.log1p(
                max(float(metrics["travel_time_hours"]), 0.0)
            )
        )
        return ga_score, None

    def state_rank(state):
        return (
            -state["served_count"],
            -state["priority_sum"],
            state["score_sum"],
            state["vessel_count"],
            tuple(sorted(state["selected"].keys())),
        )

    def state_signature(state):
        vessel_ids = (
            set(state["available_at"])
            | set(state["vessel_locations"])
        )

        return tuple(
            sorted(
                (
                    vessel_id,
                    (
                        state["available_at"][vessel_id].isoformat()
                        if vessel_id in state["available_at"]
                        else None
                    ),
                    (
                        state["vessel_locations"][vessel_id].get("code")
                        if vessel_id in state["vessel_locations"]
                        else None
                    ),
                )
                for vessel_id in vessel_ids
            )
        )

    ordered_indices = sorted(
        range(len(shipment_items)),
        key=lambda i: (
            shipment_items[i].departure_time,
            float(shipment_items[i].deadline_hours),
            shipment_items[i].shipment_ref or "",
        ),
    )

    states = [{
        "available_at": {},
        "vessel_locations": {},
        "selected": {},
        "served_count": 0,
        "priority_sum": 0.0,
        "score_sum": 0.0,
        "vessel_count": 0,
    }]

    for shipment_index in ordered_indices:
        shipment = shipment_items[shipment_index]
        context = shipment_contexts[shipment_index]
        departure = shipment.departure_time

        details = context["shipment_details"]
        origin_port = details["origin"]
        destination_port = details["destination"]

        origin_code = origin_port["code"]
        destination_code = destination_port["code"]

        plans_by_subset_strategy = {}

        for plan in plans_by_shipment[shipment_index]:
            vessel_ids = tuple(
                sorted(str(v) for v in plan.get("vessel_ids", []))
            )

            if not vessel_ids:
                continue

            duration = _get_joint_plan_duration_hours(plan)

            try:
                base_score = float(
                    plan.get("_joint_score", float("inf"))
                )
            except (TypeError, ValueError):
                base_score = float("inf")

            if not math.isfinite(base_score):
                base_score = float("inf")

            key = (
                vessel_ids,
                plan.get("speed_strategy", "UNKNOWN"),
            )

            previous = plans_by_subset_strategy.get(key)

            if previous is None or (
                base_score,
                duration,
            ) < (
                previous["_base_score"],
                previous["_base_duration"],
            ):
                candidate = dict(plan)
                candidate["_base_score"] = base_score
                candidate["_base_duration"] = duration
                plans_by_subset_strategy[key] = candidate

        candidate_plans = sorted(
            plans_by_subset_strategy.values(),
            key=lambda p: (
                p["_base_score"],
                len(p["vessel_ids"]),
                p["_base_duration"],
            ),
        )[:max_plans_per_shipment]

        expanded_states = []

        for state in states:
            # Option: leave this shipment unassigned.
            expanded_states.append(state)

            for plan in candidate_plans:
                vessel_ids = [
                    str(v) for v in plan["vessel_ids"]
                ]
                vessel_metrics = get_plan_vessel_metrics(plan)

                reposition_by_vessel = {}
                reposition_totals = {
                    "distance_km": 0.0,
                    "travel_time_hours": 0.0,
                    "fuel_kg": 0.0,
                    "fuel_cost": 0.0,
                    "operating_cost": 0.0,
                    "total_cost": 0.0,
                    "ghg_kg": 0.0,
                }

                can_schedule = True

                for vessel_id in vessel_ids:
                    vessel_record = vessels_by_id.get(vessel_id)

                    if vessel_record is None:
                        raise ValueError(
                            f"Candidate vessel {vessel_id} was not found "
                            "in the available vessel records."
                        )

                    vessel_metric = vessel_metrics.get(vessel_id, {})
                    speed = vessel_metric.get("speed_mps")

                    if speed is None:
                        speed = vessel_record.get("max_speed_mps")

                    try:
                        speed = float(speed)
                    except (TypeError, ValueError) as exc:
                        raise ValueError(
                            f"No valid speed found for vessel {vessel_id}."
                        ) from exc

                    if not math.isfinite(speed) or speed <= 0:
                        raise ValueError(
                            f"Invalid speed for vessel {vessel_id}."
                        )

                    previous_available = state[
                        "available_at"
                    ].get(vessel_id)

                    previous_location = state[
                        "vessel_locations"
                    ].get(vessel_id)

                    assumed_initial_location = False

                    if previous_available is None:
                        current_code = vessel_record.get(
                            "current_port_locode"
                        )

                        if current_code:
                            current_code = (
                                str(current_code).strip().upper()
                            )
                            previous_location = ports_by_code.get(
                                current_code
                            )

                            if previous_location is None:
                                raise ValueError(
                                    f"Vessel {vessel_id} has unknown "
                                    f"current port {current_code}."
                                )

                            previous_available = parse_location_time(
                                vessel_record.get(
                                    "location_updated_at"
                                ),
                                vessel_id,
                                departure,
                            )
                        else:
                            # Compatibility fallback when starting location
                            # has not been recorded.
                            previous_location = origin_port
                            previous_available = departure
                            assumed_initial_location = True

                    from_code = previous_location.get("code")

                    if from_code == origin_code:
                        reposition_distance_km = 0.0
                    else:
                        reposition_distance_km, _ = calculate_sea_route(
                            previous_location,
                            origin_port,
                            shipment_index=context["index"],
                        )
                        reposition_distance_km = float(
                            reposition_distance_km
                        )

                    if (
                        not math.isfinite(reposition_distance_km)
                        or reposition_distance_km < 0
                    ):
                        raise ValueError(
                            f"Invalid repositioning distance for vessel "
                            f"{vessel_id}."
                        )

                    reposition_metrics = calculate_repositioning_metrics(
                        vessel=vessel_record,
                        speed_mps=speed,
                        distance_km=reposition_distance_km,
                    )

                    reposition_hours = float(
                        reposition_metrics["travel_time_hours"]
                    )

                    arrival_at_origin = (
                        previous_available
                        + timedelta(hours=reposition_hours)
                    )

                    if arrival_at_origin > departure:
                        can_schedule = False
                        break

                    reposition_by_vessel[vessel_id] = {
                        "from_port": from_code,
                        "to_port": origin_code,
                        "distance_km": round(
                            reposition_distance_km, 3
                        ),
                        "travel_time_hours": round(
                            reposition_hours, 3
                        ),
                        "arrival_at_origin": (
                            arrival_at_origin.isoformat()
                        ),
                        "initial_location_assumed_at_origin": (
                            assumed_initial_location
                        ),
                        "fuel_kg": reposition_metrics["fuel_kg"],
                        "fuel_cost": reposition_metrics["fuel_cost"],
                        "operating_cost": reposition_metrics[
                            "operating_cost"
                        ],
                        "total_cost": reposition_metrics["total_cost"],
                        "ghg_kg": reposition_metrics["ghg_kg"],
                    }

                    for key in reposition_totals:
                        reposition_totals[key] += float(
                            reposition_metrics[key]
                            if key != "distance_km"
                            else reposition_distance_km
                        )

                if not can_schedule:
                    continue

                loaded_metrics = dict(plan.get("metrics", {}))

                loaded_fuel = float(
                    loaded_metrics.get("total_fuel_kg", 0) or 0
                )
                loaded_fuel_cost = float(
                    loaded_metrics.get("total_fuel_cost", 0) or 0
                )
                loaded_operating_cost = float(
                    loaded_metrics.get("total_operating_cost", 0) or 0
                )
                loaded_cost = float(
                    loaded_metrics.get("total_cost", 0) or 0
                )
                loaded_ghg = float(
                    loaded_metrics.get("total_ghg_kg", 0) or 0
                )
                loaded_time = float(
                    loaded_metrics.get(
                        "travel_time_hours",
                        plan["_base_duration"],
                    ) or 0
                )

                total_fuel = (
                    loaded_fuel + reposition_totals["fuel_kg"]
                )
                total_fuel_cost = (
                    loaded_fuel_cost + reposition_totals["fuel_cost"]
                )
                total_operating_cost = (
                    loaded_operating_cost
                    + reposition_totals["operating_cost"]
                )
                total_cost = (
                    loaded_cost + reposition_totals["total_cost"]
                )
                total_ghg = (
                    loaded_ghg + reposition_totals["ghg_kg"]
                )

                combined_metrics = dict(loaded_metrics)

                combined_metrics["loaded_voyage_totals"] = {
                    "fuel_kg": round(loaded_fuel, 3),
                    "fuel_cost": round(loaded_fuel_cost, 2),
                    "operating_cost": round(
                        loaded_operating_cost, 2
                    ),
                    "total_cost": round(loaded_cost, 2),
                    "ghg_kg": round(loaded_ghg, 3),
                }

                combined_metrics["repositioning_totals"] = {
                    key: round(
                        value,
                        3 if key in (
                            "distance_km",
                            "travel_time_hours",
                            "fuel_kg",
                            "ghg_kg",
                        ) else 2,
                    )
                    for key, value in reposition_totals.items()
                }

                combined_metrics["total_fuel_kg"] = round(
                    total_fuel, 3
                )
                combined_metrics["total_fuel_cost"] = round(
                    total_fuel_cost, 2
                )
                combined_metrics["total_operating_cost"] = round(
                    total_operating_cost, 2
                )
                combined_metrics["total_cost"] = round(
                    total_cost, 2
                )
                combined_metrics["total_ghg_kg"] = round(
                    total_ghg, 3
                )

                # Preserve deadline semantics: loaded voyage time remains
                # separate from repositioning + voyage operational time.
                combined_metrics["total_operational_time_hours"] = round(
                    loaded_time
                    + reposition_totals["travel_time_hours"],
                    3,
                )

                adjusted_score, adjusted_fitness = (
                    calculate_adjusted_score(combined_metrics)
                )

                new_state = {
                    "available_at": dict(state["available_at"]),
                    "vessel_locations": dict(
                        state["vessel_locations"]
                    ),
                    "selected": dict(state["selected"]),
                    "served_count": state["served_count"] + 1,
                    "priority_sum": (
                        state["priority_sum"]
                        + 1.0
                        / max(
                            float(shipment.deadline_hours),
                            1e-9,
                        )
                    ),
                    "score_sum": (
                        state["score_sum"] + adjusted_score
                    ),
                    "vessel_count": (
                        state["vessel_count"] + len(vessel_ids)
                    ),
                }

                individual_durations = []

                for vessel_id in vessel_ids:
                    vessel_metric = vessel_metrics.get(
                        vessel_id, {}
                    )

                    voyage_duration = float(
                        vessel_metric.get(
                            "travel_time_hours",
                            plan["_base_duration"],
                        )
                    )

                    if (
                        not math.isfinite(voyage_duration)
                        or voyage_duration <= 0
                    ):
                        raise ValueError(
                            f"Invalid voyage duration for vessel "
                            f"{vessel_id}."
                        )

                    individual_durations.append(voyage_duration)

                    new_state["available_at"][vessel_id] = (
                        departure
                        + timedelta(
                            hours=voyage_duration + turnaround_hours
                        )
                    )

                    new_state["vessel_locations"][
                        vessel_id
                    ] = destination_port

                selected = {
                    key: value
                    for key, value in plan.items()
                    if not key.startswith("_")
                }
                selected["metrics"] = combined_metrics

                if adjusted_fitness is not None:
                    selected["fitness"] = adjusted_fitness

                selected["schedule_details"] = {
                    "departure_time": departure.isoformat(),
                    "destination_after_voyage": destination_code,
                    "turnaround_hours": turnaround_hours,
                    "voyage_duration_hours": round(
                        max(individual_durations), 3
                    ),
                    "repositioning_by_vessel": reposition_by_vessel,
                    "total_repositioning_hours": round(
                        reposition_totals["travel_time_hours"], 3
                    ),
                    "repositioning_totals": combined_metrics[
                        "repositioning_totals"
                    ],
                    "adjusted_objective_score": round(
                        adjusted_score, 6
                    ),
                    "score_policy": (
                        "QIGA_GREEN_SCORE"
                        if scoring_policy == "QIGA"
                        else "GA_WEIGHTED_LOG_OBJECTIVE"
                    ),
                }

                new_state["selected"][shipment_index] = selected
                expanded_states.append(new_state)

        # Deduplicate scheduling states. Preserve distinct allocations
        # when the caller requests alternatives.
        best_by_signature = {}

        for state in expanded_states:
            signature = state_signature(state)

            if return_alternatives:
                allocation_signature = tuple(
                    sorted(
                        (
                            index,
                            tuple(sorted(
                                str(v)
                                for v in plan.get("vessel_ids", [])
                            )),
                            plan.get("speed_strategy", "UNKNOWN"),
                        )
                        for index, plan in state["selected"].items()
                    )
                )
                signature = (signature, allocation_signature)

            current = best_by_signature.get(signature)

            if (
                current is None
                or state_rank(state) < state_rank(current)
            ):
                best_by_signature[signature] = state

        states = sorted(
            best_by_signature.values(),
            key=state_rank,
        )[:beam_width]

    if return_alternatives:
        alternatives = []
        seen_allocations = set()

        for state in sorted(states, key=state_rank):
            selected = state["selected"]

            signature = tuple(
                sorted(
                    (
                        index,
                        tuple(sorted(
                            str(v)
                            for v in plan.get("vessel_ids", [])
                        )),
                        plan.get("speed_strategy", "UNKNOWN"),
                    )
                    for index, plan in selected.items()
                )
            )

            if signature in seen_allocations:
                continue

            seen_allocations.add(signature)
            alternatives.append(selected)

            if len(alternatives) >= max_alternatives:
                break

        return alternatives

    # Preserve the original dictionary return contract.
    best_state = min(states, key=state_rank)
    return best_state["selected"]



def get_time_aware_allocation_alternatives(
    *args,
    max_alternatives=2,
    **kwargs,
):
    """Return up to max_alternatives distinct feasible allocations."""
    if max_alternatives < 1:
        raise ValueError("max_alternatives must be positive.")

    return joint_allocate_time_aware_plans(
        *args,
        return_alternatives=True,
        max_alternatives=max_alternatives,
        **kwargs,
    )


# BASIC API AND PORT LOOKUP
# ============================================================


@app.get("/ports")
def search_ports(q: str = "", limit: int = 100):
    """Return ports, or search by name/code when a query is provided."""
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="limit must be between 1 and 100",
        )

    ports = load_ports()
    query = q.strip().casefold()

    if query:
        matches = [
            port
            for port in ports
            if query in str(port.get("name", "")).casefold()
            or query in str(port.get("code", "")).casefold()
        ]
    else:
        matches = ports

    matches.sort(
        key=lambda port: (
            str(port.get("name", "")).casefold() != query,
            str(port.get("name", "")).casefold(),
        )
    )

    results = matches[:limit]
    return {"count": len(results), "ports": results}


@app.get("/")
def root():
    return {
        "message": "EcoFleet AI API is running.",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# ============================================================
# ML FUEL PREDICTION
# ============================================================

@app.post("/predict-fuel")
def predict_fuel_endpoint(request: FuelPredictionRequest):
    prediction = predict_fuel(request.model_dump())

    return {
        "predicted_fuel_kg_per_second": prediction,
    }


# ============================================================
# VESSEL APIs
# ============================================================

@app.get("/vessels")
def list_vessels():
    vessels = load_vessels()

    return {
        "success": True,
        "count": len(vessels),
        "vessels": vessels,
    }


@app.get("/vessels/{vessel_id}")
def vessel_details(vessel_id: str):
    for vessel in load_vessels():
        if vessel.get("vessel_id") == vessel_id:
            return vessel

    raise HTTPException(
        status_code=404,
        detail="Vessel not found.",
    )


@app.post("/vessels")
def create_vessels(payload: dict):
    try:
        if "vessels" in payload:
            vessel_data_list = payload["vessels"]

            if not isinstance(vessel_data_list, list):
                raise HTTPException(
                    status_code=400,
                    detail="vessels must be a list.",
                )
        else:
            vessel_data_list = [payload]

        if not vessel_data_list:
            raise HTTPException(
                status_code=400,
                detail="No vessel data supplied.",
            )

        existing_vessels = load_vessels()
        existing_ids = {
            vessel.get("vessel_id")
            for vessel in existing_vessels
        }

        new_vessels = []

        for vessel_data in vessel_data_list:
            vessel = validate_and_clean_vessel(vessel_data)
            vessel_id = vessel["vessel_id"]

            if vessel_id in existing_ids:
                raise HTTPException(
                    status_code=409,
                    detail=f"Vessel {vessel_id} already exists.",
                )

            existing_ids.add(vessel_id)
            new_vessels.append(vessel)

        existing_vessels.extend(new_vessels)
        save_vessels(existing_vessels)

        return {
            "success": True,
            "message": "Vessel(s) added successfully.",
            "added_count": len(new_vessels),
            "vessels": new_vessels,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.patch("/vessels/{vessel_id}")
def patch_vessel(vessel_id: str, payload: dict):
    vessels = load_vessels()

    for index, vessel in enumerate(vessels):
        if vessel.get("vessel_id") != vessel_id:
            continue

        updated_vessel = {
            **vessel,
            **payload,
            "vessel_id": vessel_id,
        }

        try:
            validated_vessel = validate_and_clean_vessel(
                updated_vessel
            )
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=str(exc),
            ) from exc

        vessels[index] = validated_vessel
        save_vessels(vessels)

        return {
            "success": True,
            "message": "Vessel updated successfully.",
            "vessel": validated_vessel,
        }

    raise HTTPException(
        status_code=404,
        detail="Vessel not found.",
    )


@app.patch("/vessels/{vessel_id}/status")
def patch_vessel_status(vessel_id: str, payload: dict):
    if "status" not in payload:
        raise HTTPException(
            status_code=400,
            detail="Status is required.",
        )

    new_status = str(payload["status"]).strip().upper()

    allowed_statuses = {
        "AVAILABLE",
        "ON_VOYAGE",
        "MAINTENANCE",
        "UNAVAILABLE",
    }

    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid status. Allowed statuses: "
                f"{sorted(allowed_statuses)}"
            ),
        )

    vessels = load_vessels()

    for vessel in vessels:
        if vessel.get("vessel_id") == vessel_id:
            vessel["status"] = new_status
            save_vessels(vessels)

            return {
                "success": True,
                "message": "Vessel status updated successfully.",
                "vessel": vessel,
            }

    raise HTTPException(
        status_code=404,
        detail="Vessel not found.",
    )


@app.delete("/vessels/{vessel_id}")
def remove_vessel(vessel_id: str):
    vessels = load_vessels()

    remaining_vessels = []
    deleted_vessel = None

    for vessel in vessels:
        if vessel.get("vessel_id") == vessel_id:
            deleted_vessel = vessel
        else:
            remaining_vessels.append(vessel)

    if deleted_vessel is None:
        raise HTTPException(
            status_code=404,
            detail="Vessel not found.",
        )

    save_vessels(remaining_vessels)

    return {
        "success": True,
        "message": "Vessel deleted successfully.",
        "vessel": deleted_vessel,
    }


# ============================================================
# FLEET UPLOAD AND MAPPING
# ============================================================

@app.post("/fleet/upload")
async def upload_fleet(file: UploadFile = File(...)):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in {".csv", ".xlsx"}:
        raise HTTPException(
            status_code=400,
            detail="Only CSV and XLSX files are supported.",
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    # Basic request-size safeguard.
    max_upload_bytes = 10 * 1024 * 1024

    if len(file_bytes) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail="Uploaded file exceeds the 10 MB limit.",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension,
        ) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        records = read_fleet_file(temp_path)

        if not records:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file contains no records.",
            )

        mappings = analyze_uploaded_columns(records)

        session_id = create_import_session(
            records=records,
            mappings=mappings,
            filename=filename,
        )

        return {
            "success": True,
            "message": (
                "Fleet file analyzed successfully. "
                "Please confirm the detected mappings."
            ),
            "session_id": session_id,
            "filename": filename,
            "record_count": len(records),
            "mappings": mappings,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except OSError:
                pass
        await file.close()


@app.post("/fleet/mapping/confirm")
def confirm_fleet_mapping(payload: dict):
    session_id = payload.get("session_id")

    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id is required.",
        )

    session = get_import_session(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Import session not found or expired.",
        )

    records = session["records"]
    mappings = payload.get("mappings", session["mappings"])

    if not isinstance(mappings, list):
        raise HTTPException(
            status_code=400,
            detail="mappings must be a list.",
        )

    try:
        vessels = transform_records(records, mappings)
        validation = process_vessels(vessels)

        validation_errors = validation.get("errors", [])
        duplicates = validation.get("duplicates", [])

        if validation_errors:
            return {
                "success": False,
                "message": "Fleet mapping validation errors were found.",
                "session_id": session_id,
                "errors": validation_errors,
                "duplicates": duplicates,
                "readiness": validation.get("readiness"),
                "optimization_readiness": validation.get(
                    "optimization_readiness"
                ),
                "vessel_readiness": validation.get(
                    "vessel_readiness"
                ),
                "vessels": validation.get("vessels"),
            }

        if duplicates:
            return {
                "success": False,
                "message": "Duplicate vessel IDs were found.",
                "session_id": session_id,
                "duplicates": duplicates,
                "vessels": validation.get("vessels"),
            }

        existing_vessels = load_vessels()
        existing_ids = {
            vessel.get("vessel_id")
            for vessel in existing_vessels
        }

        new_vessels = []
        skipped_existing_ids = []

        for vessel in validation["vessels"]:
            vessel_id = vessel.get("vessel_id")

            if vessel_id in existing_ids:
                skipped_existing_ids.append(vessel_id)
                continue

            existing_ids.add(vessel_id)
            new_vessels.append(vessel)

        updated_fleet = existing_vessels + new_vessels
        save_vessels(updated_fleet)
        delete_import_session(session_id)

        return {
            "success": True,
            "message": "Fleet imported successfully.",
            "session_id": session_id,
            "imported_count": len(new_vessels),
            "skipped_existing_count": len(skipped_existing_ids),
            "skipped_existing_ids": skipped_existing_ids,
            "fleet_count": len(updated_fleet),
            "readiness": validation.get("readiness"),
            "optimization_readiness": validation.get(
                "optimization_readiness"
            ),
            "vessel_readiness": validation.get("vessel_readiness"),
            "vessels": new_vessels,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


# ============================================================
# SHIPMENT MANAGEMENT
# ============================================================

@app.post("/shipments")
def create_shipment(request: ShipmentRequest):
    shipment = {
        "shipment_id": str(uuid.uuid4()),
        "cargo_demand_tons": request.cargo_demand_tons,
        "origin": request.origin,
        "destination": request.destination,
        "distance_km": request.distance_km,
        "deadline_hours": request.deadline_hours,
        "status": "CREATED",
        "selected_vessel_ids": [],
        "plan": None,
    }

    shipments = load_shipments()
    shipments.append(shipment)
    save_shipments(shipments)

    return {
        "success": True,
        "message": "Shipment created successfully.",
        "shipment": shipment,
    }


@app.get("/shipments")
def list_shipments():
    shipments = load_shipments()

    return {
        "success": True,
        "count": len(shipments),
        "shipments": shipments,
    }


@app.get("/shipments/{shipment_id}")
def shipment_details(shipment_id: str):
    for shipment in load_shipments():
        if shipment.get("shipment_id") == shipment_id:
            return {
                "success": True,
                "shipment": shipment,
            }

    raise HTTPException(
        status_code=404,
        detail="Shipment not found.",
    )


# ============================================================
# BASELINE OPTIMIZATION
# ============================================================

@app.post("/shipments/plan")
def create_baseline_plan(request: ShipmentRequest):
    available_vessels = get_available_vessels()

    if not available_vessels:
        return {
            "success": False,
            "message": "No AVAILABLE vessels are currently available.",
            "best_plan": None,
        }

    return optimize_baseline(
        vessels=available_vessels,
        cargo_demand_tons=request.cargo_demand_tons,
        distance_km=request.distance_km,
        deadline_hours=request.deadline_hours,
    )


# ============================================================
# QIGA SINGLE-SHIPMENT OPTIMIZATION
# ============================================================

@app.post("/shipments/optimize")
def optimize_shipment(request: OptimizationRequest):
    available_vessels = get_available_vessels()

    if not available_vessels:
        return {
            "success": False,
            "message": "No AVAILABLE vessels are currently available.",
            "candidate_count": 0,
            "best_plan": None,
        }

    try:
        result = optimize_qiga(
            vessels=available_vessels,
            cargo_demand_tons=request.cargo_demand_tons,
            distance_km=request.distance_km,
            deadline_hours=request.deadline_hours,
            environment=request.environment,
            population_size=10,
            generations=20,
            learning_rate=0.05,
            seed=42,
            patience=5,
        )

        best_plan = result.get("best_plan")

        if best_plan:
            selected_ids = set(best_plan.get("vessel_ids", []))

            best_plan["vessels"] = [
                {
                    "vessel_id": vessel["vessel_id"],
                    "vessel_name": vessel.get(
                        "vessel_name",
                        vessel["vessel_id"],
                    ),
                }
                for vessel in available_vessels
                if vessel["vessel_id"] in selected_ids
            ]

        result["shipment"] = {
            "cargo_demand_tons": request.cargo_demand_tons,
            "origin": request.origin,
            "destination": request.destination,
            "distance_km": request.distance_km,
            "deadline_hours": request.deadline_hours,
        }
        result["available_vessel_count"] = len(available_vessels)

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"QIGA optimization failed: {exc}",
        ) from exc


# ============================================================
# ACCEPT AN OPTIMIZATION PLAN
# ============================================================

@app.post("/shipments/accept")
def accept_shipment_plan(payload: dict):
    shipment_data = payload.get("shipment")
    best_plan = payload.get("best_plan")

    if not isinstance(shipment_data, dict):
        raise HTTPException(
            status_code=400,
            detail="shipment is required.",
        )

    if not isinstance(best_plan, dict):
        raise HTTPException(
            status_code=400,
            detail="best_plan is required.",
        )

    vessel_ids = best_plan.get("vessel_ids")

    if not isinstance(vessel_ids, list) or not vessel_ids:
        raise HTTPException(
            status_code=400,
            detail="best_plan.vessel_ids must contain at least one vessel.",
        )

    if any(not isinstance(vessel_id, str) for vessel_id in vessel_ids):
        raise HTTPException(
            status_code=400,
            detail="Every selected vessel ID must be a string.",
        )

    if len(vessel_ids) != len(set(vessel_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate vessel IDs in selected plan.",
        )

    vessels = load_vessels()
    vessel_map = {
        vessel.get("vessel_id"): vessel
        for vessel in vessels
    }

    missing_vessels = [
        vessel_id
        for vessel_id in vessel_ids
        if vessel_id not in vessel_map
    ]

    if missing_vessels:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Selected vessel(s) not found.",
                "missing_vessel_ids": missing_vessels,
            },
        )

    unavailable_vessels = [
        vessel_id
        for vessel_id in vessel_ids
        if str(
            vessel_map[vessel_id].get("status", "")
        ).strip().upper() != "AVAILABLE"
    ]

    if unavailable_vessels:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "One or more selected vessels "
                    "are no longer AVAILABLE."
                ),
                "vessel_ids": unavailable_vessels,
            },
        )

    # Validate essential shipment values instead of silently persisting
    # missing or non-positive values.
    try:
        cargo_demand = float(shipment_data["cargo_demand_tons"])
        distance_km = float(shipment_data["distance_km"])
        deadline_hours = float(shipment_data["deadline_hours"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Shipment requires numeric cargo_demand_tons, "
                "distance_km and deadline_hours."
            ),
        ) from exc

    if (
        not all(
            math.isfinite(value) and value > 0
            for value in (
                cargo_demand,
                distance_km,
                deadline_hours,
            )
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Shipment numeric values must be finite and positive.",
        )

    selected_vessels = [
        vessel_map[vessel_id]
        for vessel_id in vessel_ids
    ]

    combined_capacity = sum(
        float(vessel.get("capacity_tons", 0))
        for vessel in selected_vessels
    )

    if combined_capacity < cargo_demand:
        raise HTTPException(
            status_code=422,
            detail="Selected vessels do not have enough cargo capacity.",
        )

    metrics = best_plan.get("metrics")

    if not isinstance(metrics, dict) or not metrics.get("feasible", False):
        raise HTTPException(
            status_code=422,
            detail="Plan metrics are missing or do not indicate feasibility.",
        )

    try:
        travel_time = float(metrics["travel_time_hours"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Plan must include a valid travel_time_hours metric.",
        ) from exc

    if not math.isfinite(travel_time) or travel_time > deadline_hours:
        raise HTTPException(
            status_code=422,
            detail="Selected plan does not meet the shipment deadline.",
        )

    shipment_id = str(uuid.uuid4())

    shipment = {
        "shipment_id": shipment_id,
        "cargo_demand_tons": cargo_demand,
        "origin": shipment_data.get("origin"),
        "destination": shipment_data.get("destination"),
        "distance_km": distance_km,
        "deadline_hours": deadline_hours,
        "status": "ON_VOYAGE",
        "selected_vessel_ids": vessel_ids,
        "plan": best_plan,
    }

    # NOTE: JSON file writes are not transactional. A database or explicit
    # transaction/locking layer is needed for safe concurrent acceptance.
    for vessel in vessels:
        if vessel.get("vessel_id") in vessel_ids:
            vessel["status"] = "ON_VOYAGE"

    shipments = load_shipments()
    shipments.append(shipment)

    save_vessels(vessels)
    save_shipments(shipments)

    return {
        "success": True,
        "message": (
            "Optimization plan accepted. "
            "Selected vessels are now ON_VOYAGE."
        ),
        "shipment": shipment,
        "updated_vessel_ids": vessel_ids,
    }


# ============================================================
# COMPLETE VOYAGE
# ============================================================

@app.post("/shipments/{shipment_id}/complete")
def complete_shipment(shipment_id: str):
    shipments = load_shipments()

    shipment = next(
        (
            item
            for item in shipments
            if item.get("shipment_id") == shipment_id
        ),
        None,
    )

    if shipment is None:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found.",
        )

    if shipment.get("status") != "ON_VOYAGE":
        raise HTTPException(
            status_code=409,
            detail="Only an ON_VOYAGE shipment can be completed.",
        )

    selected_vessel_ids = set(
        shipment.get("selected_vessel_ids", [])
    )

    vessels = load_vessels()
    returned_vessels = []

    # Do not return a vessel to AVAILABLE if another active shipment
    # references the same vessel.
    other_active_vessel_ids = set()

    for other in shipments:
        if (
            other.get("shipment_id") != shipment_id
            and other.get("status") == "ON_VOYAGE"
        ):
            other_active_vessel_ids.update(
                other.get("selected_vessel_ids", [])
            )

    for vessel in vessels:
        vessel_id = vessel.get("vessel_id")

        if vessel_id in selected_vessel_ids:
            if vessel_id not in other_active_vessel_ids:
                vessel["status"] = "AVAILABLE"
                returned_vessels.append(vessel_id)

    shipment["status"] = "COMPLETED"

    save_vessels(vessels)
    save_shipments(shipments)

    return {
        "success": True,
        "message": (
            "Voyage completed successfully. "
            "Eligible selected vessels are AVAILABLE again."
        ),
        "shipment": shipment,
        "returned_vessel_ids": returned_vessels,
    }


# ============================================================
# GENETIC ALGORITHM SINGLE-SHIPMENT OPTIMIZATION
# ============================================================

@app.post("/shipments/optimize-ga")
def optimize_shipment_ga(request: OptimizationRequest):
    available_vessels = get_available_vessels()

    if not available_vessels:
        return {
            "success": False,
            "message": "No AVAILABLE vessels are currently available.",
            "candidate_count": 0,
            "best_plan": None,
            "algorithm": "GA",
        }

    try:
        result = optimize_ga(
            vessels=available_vessels,
            cargo_demand_tons=request.cargo_demand_tons,
            distance_km=request.distance_km,
            deadline_hours=request.deadline_hours,
            environment=request.environment,
            population_size=12,
            generations=15,
            mutation_rate=0.15,
            elite_count=2,
            seed=42,
            patience=5,
        )

        best_plan = result.get("best_plan")

        if best_plan:
            selected_ids = set(best_plan.get("vessel_ids", []))

            best_plan["vessels"] = [
                {
                    "vessel_id": vessel["vessel_id"],
                    "vessel_name": vessel.get(
                        "vessel_name",
                        vessel["vessel_id"],
                    ),
                }
                for vessel in available_vessels
                if vessel["vessel_id"] in selected_ids
            ]

        result["shipment"] = {
            "cargo_demand_tons": request.cargo_demand_tons,
            "origin": request.origin,
            "destination": request.destination,
            "distance_km": request.distance_km,
            "deadline_hours": request.deadline_hours,
        }
        result["available_vessel_count"] = len(available_vessels)

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"GA optimization failed: {exc}",
        ) from exc


# ============================================================
# JOINT MULTI-SHIPMENT OPTIMIZATION
# ============================================================


@app.post("/shipments/optimize-multi")
def optimize_multiple_shipments(
    request: MultiShipmentOptimizationRequest,
):
    """
    Jointly allocate vessels across shipments.

    With departure times, enforce vessel availability,
    repositioning and turnaround.

    Return up to two distinct allocations when supported
    by the time-aware scheduler.
    """
    batch_start = time.perf_counter()

    # 1. Validate departure times
    has_departure_times = any(
        shipment.departure_time is not None
        for shipment in request.shipments
    )

    all_have_departure_times = (
        bool(request.shipments)
        and all(
            shipment.departure_time is not None
            for shipment in request.shipments
        )
    )

    if has_departure_times and not all_have_departure_times:
        raise HTTPException(
            status_code=422,
            detail=(
                "Provide departure_time for every shipment "
                "in the batch, or omit it from every shipment."
            ),
        )

    if all_have_departure_times:
        optimization_mode = "time_aware_joint_allocation"
        shared_vessel_scheduling_enforced = True
        allocation_method = "time_aware_bounded_beam_search"
    else:
        optimization_mode = "joint_unique_vessel_allocation"
        shared_vessel_scheduling_enforced = False
        allocation_method = (
            "feasible_plan_enumeration_with_dynamic_programming"
        )

    # Normalize either allocator return format into a list of
    # per-shipment plans. A list contains one plan or None per
    # shipment; a dictionary maps shipment indexes to plans.
    def normalize_allocation(allocation):
        if isinstance(allocation, dict):
            return [
                allocation.get(index)
                for index in range(len(contexts))
            ]

        if isinstance(allocation, list):
            if len(allocation) != len(contexts):
                raise ValueError(
                    "Invalid allocation length: expected "
                    f"{len(contexts)} assignments, received "
                    f"{len(allocation)}."
                )
            return allocation

        raise TypeError(
            "Unexpected allocation type: "
            f"{type(allocation).__name__}"
        )

    # 2. Load ports and available vessels
    ports = load_ports()
    ports_by_code = build_ports_by_code(ports)
    available_vessels = get_available_vessels()

    if not available_vessels:
        return {
            "success": False,
            "message": "No AVAILABLE vessels are currently available.",
            "algorithm": "JOINT_ALLOCATION",
            "requested_algorithm": request.algorithm,
            "shipment_count": len(request.shipments),
            "optimization_mode": optimization_mode,
            "shared_vessel_allocation_enforced": True,
            "shared_vessel_scheduling_enforced": (
                shared_vessel_scheduling_enforced
            ),
            "turnaround_hours": (
                TURNAROUND_HOURS
                if all_have_departure_times
                else None
            ),
            "allocation_alternatives": [],
            "shipments": [],
        }

    # 3. Generate candidate plans for every shipment
    contexts = []
    all_candidate_vessel_ids = set()

    for index, shipment in enumerate(request.shipments, start=1):
        shipment_ref = (
            shipment.shipment_ref or f"SHIP-{index:03d}"
        )

        origin_code = shipment.origin_locode.strip().upper()
        destination_code = (
            shipment.destination_locode.strip().upper()
        )

        origin_port = ports_by_code.get(origin_code)
        destination_port = ports_by_code.get(destination_code)

        if origin_port is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Shipment {index}: origin port "
                    f"{origin_code} not found"
                ),
            )

        if destination_port is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Shipment {index}: destination port "
                    f"{destination_code} not found"
                ),
            )

        distance_km, route_geometry = calculate_sea_route(
            origin_port,
            destination_port,
            shipment_index=index,
        )

        shipment_details = {
            "shipment_ref": shipment_ref,
            "origin": origin_port,
            "destination": destination_port,
            "cargo_demand_tons": shipment.cargo_demand_tons,
            "deadline_hours": shipment.deadline_hours,
            "distance_km": distance_km,
            "route_geometry": route_geometry,
        }

        if shipment.departure_time is not None:
            shipment_details["departure_time"] = (
                shipment.departure_time.isoformat()
            )

        plan_start = time.perf_counter()

        try:
            (
                plans,
                deadline_capable_vessels,
                maximum_deadline_capacity,
            ) = enumerate_joint_shipment_plans(
                vessels=available_vessels,
                cargo_demand_tons=shipment.cargo_demand_tons,
                distance_km=distance_km,
                deadline_hours=shipment.deadline_hours,
                environment=None,
                scoring_policy=request.algorithm,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Shipment {index}: {exc}",
            ) from exc

        plan_runtime = time.perf_counter() - plan_start

        for plan in plans:
            all_candidate_vessel_ids.update(
                str(vessel_id)
                for vessel_id in plan["vessel_ids"]
            )

        contexts.append({
            "index": index - 1,
            "shipment": shipment,
            "shipment_details": shipment_details,
            "plans": plans,
            "deadline_capable_vessels": deadline_capable_vessels,
            "maximum_deadline_capacity": maximum_deadline_capacity,
            "plan_runtime": plan_runtime,
        })

    # 4. Check candidate vessel limit
    if (
        len(all_candidate_vessel_ids)
        > MAX_JOINT_ALLOCATION_VESSELS
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Joint allocation supports at most "
                f"{MAX_JOINT_ALLOCATION_VESSELS} distinct "
                "candidate vessels. Reduce the available fleet "
                "or use a scalable allocation solver."
            ),
        )

    # 5. Allocate shipment plans
    if all_have_departure_times:
        try:
            allocation_alternatives = (
                get_time_aware_allocation_alternatives(
                    shipment_items=[
                        context["shipment"]
                        for context in contexts
                    ],
                    plans_by_shipment=[
                        context["plans"]
                        for context in contexts
                    ],
                    shipment_contexts=contexts,
                    vessel_records=available_vessels,
                    ports_by_code=ports_by_code,
                    turnaround_hours=TURNAROUND_HOURS,
                    scoring_policy=request.algorithm,
                    max_alternatives=2,
                )
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Time-aware scheduling failed: {exc}",
            ) from exc

        allocation_alternatives = (
            allocation_alternatives or []
        )
    else:
        vessel_bit_by_id = {
            vessel_id: 1 << position
            for position, vessel_id in enumerate(
                sorted(all_candidate_vessel_ids)
            )
        }

        best_allocation = joint_allocate_plans(
            shipment_contexts=contexts,
            vessel_bit_by_id=vessel_bit_by_id,
        )

        allocation_alternatives = (
            [best_allocation]
            if best_allocation is not None
            else []
        )

    # Normalize all alternatives once. This fixes both the best-plan
    # construction and the alternative serialization below.
    normalized_alternatives = [
        normalize_allocation(allocation)
        for allocation in allocation_alternatives
    ]

    best_assignments = (
        normalized_alternatives[0]
        if normalized_alternatives
        else [None] * len(contexts)
    )

    # 6. Build the best-plan response for each shipment
    results = []

    for context, chosen_plan in zip(contexts, best_assignments):
        shipment_details = context["shipment_details"]
        candidate_count = len(context["plans"])

        deadline_capable_vessels = context[
            "deadline_capable_vessels"
        ]
        maximum_capacity = context["maximum_deadline_capacity"]

        if chosen_plan is not None:
            public_plan = {
                key: value
                for key, value in chosen_plan.items()
                if not key.startswith("_")
            }

            selected_vessel_ids = {
                str(vessel_id)
                for vessel_id in chosen_plan.get("vessel_ids", [])
            }

            baseline_plan = next(
                (
                    plan
                    for plan in context["plans"]
                    if (
                        plan.get("speed_strategy") == "BALANCED"
                        and {
                            str(vessel_id)
                            for vessel_id in plan.get("vessel_ids", [])
                        } == selected_vessel_ids
                    )
                ),
                None,
            )

            optimized_metrics = chosen_plan.get("metrics", {})
            baseline_metrics = (
                baseline_plan.get("metrics", {})
                if baseline_plan
                else {}
            )

            def calculate_savings_percent(baseline, optimized):
                try:
                    baseline = float(baseline)
                    optimized = float(optimized)

                    if (
                        not math.isfinite(baseline)
                        or not math.isfinite(optimized)
                        or baseline <= 0
                    ):
                        return None

                    return round(
                        (baseline - optimized) / baseline * 100,
                        2,
                    )
                except (TypeError, ValueError):
                    return None

            public_plan["savings"] = {
                "fuel_saved_percent": calculate_savings_percent(
                    baseline_metrics.get("total_fuel_kg"),
                    optimized_metrics.get("total_fuel_kg"),
                ),
                "ghg_reduced_percent": calculate_savings_percent(
                    baseline_metrics.get("total_ghg_kg"),
                    optimized_metrics.get("total_ghg_kg"),
                ),
            }

            selected_ids = {
                str(vessel_id)
                for vessel_id in public_plan.get("vessel_ids", [])
            }

            public_plan["vessels"] = [
                {
                    "vessel_id": vessel["vessel_id"],
                    "vessel_name": vessel.get(
                        "vessel_name",
                        vessel["vessel_id"],
                    ),
                }
                for vessel in available_vessels
                if str(vessel.get("vessel_id")) in selected_ids
            ]

            results.append({
                "success": True,
                "message": (
                    "Feasible plan selected by joint batch allocation."
                ),
                "candidate_count": candidate_count,
                "best_plan": public_plan,
                "history": [],
                "generations_completed": 0,
                "runtime_seconds": round(
                    context["plan_runtime"], 4
                ),
                "algorithm": "JOINT_ALLOCATION",
                "requested_algorithm": request.algorithm,
                "shipment": shipment_details,
                "available_vessel_count": len(available_vessels),
            })
            continue

        if maximum_capacity < context["shipment"].cargo_demand_tons:
            message = (
                "No feasible plan: vessels capable of meeting "
                "the deadline at maximum speed do not have enough "
                "combined cargo capacity."
            )
        elif candidate_count:
            message = (
                "This shipment has feasible individual plans, "
                "but no compatible vessel allocation was selected "
                "in the global batch solution."
            )
        else:
            message = (
                "No feasible plan found with the current speed "
                "strategies and planner constraints."
            )

        results.append({
            "success": False,
            "message": message,
            "candidate_count": candidate_count,
            "best_plan": None,
            "history": [],
            "generations_completed": 0,
            "runtime_seconds": round(
                context["plan_runtime"], 4
            ),
            "algorithm": "JOINT_ALLOCATION",
            "requested_algorithm": request.algorithm,
            "shipment": shipment_details,
            "available_vessel_count": len(available_vessels),
            "deadline_capable_vessel_ids": [
                vessel["vessel_id"]
                for vessel in deadline_capable_vessels
            ],
            "maximum_feasible_capacity_tons": maximum_capacity,
        })

    # 7. Serialize distinct allocation alternatives
    public_alternatives = []
    seen_signatures = set()

    for allocation in normalized_alternatives:
        allocation_shipments = []
        used_vessels = set()
        signature_items = []

        for index, context in enumerate(contexts):
            chosen_plan = allocation[index]

            if chosen_plan is None:
                allocation_shipments.append({
                    "shipment_ref": (
                        context["shipment_details"]["shipment_ref"]
                    ),
                    "success": False,
                    "best_plan": None,
                })
                signature_items.append((index, None))
                continue

            public_plan = {
                key: value
                for key, value in chosen_plan.items()
                if not key.startswith("_")
            }

            vessel_ids = [
                str(vessel_id)
                for vessel_id in public_plan.get("vessel_ids", [])
            ]

            if any(
                vessel_id in used_vessels
                for vessel_id in vessel_ids
            ):
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Allocator returned an invalid alternative "
                        "that assigns a vessel to multiple shipments."
                    ),
                )

            used_vessels.update(vessel_ids)

            selected_ids = set(vessel_ids)
            public_plan["vessels"] = [
                {
                    "vessel_id": vessel["vessel_id"],
                    "vessel_name": vessel.get(
                        "vessel_name",
                        vessel["vessel_id"],
                    ),
                }
                for vessel in available_vessels
                if str(vessel.get("vessel_id")) in selected_ids
            ]

            allocation_shipments.append({
                "shipment_ref": (
                    context["shipment_details"]["shipment_ref"]
                ),
                "success": True,
                "best_plan": public_plan,
            })

            signature_items.append((
                index,
                tuple(sorted(vessel_ids)),
                public_plan.get("speed_strategy", "UNKNOWN"),
            ))

        signature = tuple(signature_items)

        if signature in seen_signatures:
            continue

        seen_signatures.add(signature)

        public_alternatives.append({
            "rank": len(public_alternatives) + 1,
            "shipments": allocation_shipments,
        })

        if len(public_alternatives) >= 2:
            break

    # 8. Return the batch response
    return {
        "success": all(item["success"] for item in results),
        "algorithm": "JOINT_ALLOCATION",
        "requested_algorithm": request.algorithm,
        "scoring_policy": (
            "QIGA_GREEN_SCORE"
            if request.algorithm == "QIGA"
            else "GA_WEIGHTED_LOG_OBJECTIVE"
        ),
        "allocation_method": allocation_method,
        "shipment_count": len(results),
        "optimization_mode": optimization_mode,
        "shared_vessel_allocation_enforced": True,
        "shared_vessel_scheduling_enforced": (
            shared_vessel_scheduling_enforced
        ),
        "turnaround_hours": (
            TURNAROUND_HOURS
            if all_have_departure_times
            else None
        ),
        "allocation_objective": (
            "Maximize shipments served; then prioritize tighter "
            "deadlines; then minimize combined objective score "
            "and vessels used, subject to vessel availability, "
            "turnaround, and repositioning time."
            if all_have_departure_times
            else (
                "Maximize shipments served; then prioritize tighter "
                "deadlines; then minimize combined objective score "
                "and vessels used."
            )
        ),
        "batch_runtime_seconds": round(
            time.perf_counter() - batch_start, 4
        ),
        "allocation_alternatives": public_alternatives,
        "shipments": results,
    }



# ============================================================
# ROUTE DISTANCE
# ============================================================

@app.get("/route-distance")
def calculate_route_distance(origin: str, destination: str):
    """Calculate sea route distance and geometry between two port codes."""
    if not origin or not destination:
        raise HTTPException(
            status_code=400,
            detail="Origin and destination port codes are required.",
        )

    ports = load_ports()
    ports_by_code = build_ports_by_code(ports)

    origin_code = origin.strip().upper()
    destination_code = destination.strip().upper()

    if not origin_code or not destination_code:
        raise HTTPException(
            status_code=400,
            detail="Origin and destination port codes are required.",
        )

    if origin_code == destination_code:
        raise HTTPException(
            status_code=400,
            detail="Origin and destination ports must be different.",
        )

    origin_port = ports_by_code.get(origin_code)
    destination_port = ports_by_code.get(destination_code)

    if origin_port is None:
        raise HTTPException(
            status_code=404,
            detail=f"Origin port not found: {origin_code}",
        )

    if destination_port is None:
        raise HTTPException(
            status_code=404,
            detail=f"Destination port not found: {destination_code}",
        )

    distance_km, route_geometry = calculate_sea_route(
        origin_port,
        destination_port,
    )
    
    return {
        "origin": origin_port,
        "destination": destination_port,
        "distance_km": distance_km,
        "route_geometry": route_geometry,
    }
