import itertools

from prediction import predict_fuel
from fitness import rank_by_green_score

# ============================================================
# ECOFLEET CONFIGURATION
# ============================================================

# Demo fuel prices in INR per kg.
# These are configurable assumptions for the prototype.
FUEL_PRICES_PER_KG = {
    "DIESEL": 90.0,
    "LNG": 70.0,
    "METHANOL": 60.0,
}

# Demo lifecycle/emission factors in kg CO2e per kg fuel.
# Keep configurable so real regulatory/fuel data can be
# supplied later without changing the optimizer.
GHG_FACTORS_PER_KG_FUEL = {
    "DIESEL": 3.20,
    "LNG": 2.75,
    "METHANOL": 1.38,
}

DEFAULT_FUEL_PRICE_PER_KG = 90.0
DEFAULT_GHG_FACTOR = 3.20


# Environmental conditions used by the ML model.
DEFAULT_ENVIRONMENT = {
    "Ship_Heading": 90.0,
    "Ship_Bearing": 90.0,
    "Weather_WindSpeed10M": 5.0,
    "Weather_WindDirection10M": 180.0,
    "Weather_WaveHeight": 1.5,
    "Weather_WaveDirection": 180.0,
    "Weather_WavePeriod": 7.0,
    "Weather_OceanCurrentVelocity": 0.5,
    "Weather_OceanCurrentDirection": 180.0,
    "Weather_Temperature2M": 25.0,
    "Weather_SurfacePressure": 1013.0,
    "Weather_Precipitation": 0.0,
    "Environment_SeaFloorDepth": 100.0,
}


def normalize_fuel_type(fuel_type):
    if fuel_type is None:
        return "DIESEL"

    return str(
        fuel_type
    ).strip().upper()


def get_fuel_price(fuel_type):
    fuel = normalize_fuel_type(
        fuel_type
    )

    return FUEL_PRICES_PER_KG.get(
        fuel,
        DEFAULT_FUEL_PRICE_PER_KG,
    )


def get_ghg_factor(fuel_type):
    fuel = normalize_fuel_type(
        fuel_type
    )

    return GHG_FACTORS_PER_KG_FUEL.get(
        fuel,
        DEFAULT_GHG_FACTOR,
    )


def calculate_travel_time_hours(
    distance_km,
    speed_mps,
):
    if speed_mps <= 0:
        return float("inf")

    distance_meters = (
        distance_km * 1000.0
    )

    seconds = (
        distance_meters
        / speed_mps
    )

    return seconds / 3600.0


def calculate_candidate_metrics(
    vessels,
    speeds,
    distance_km,
    cargo_demand_tons,
    environment=None,
):
    environment = {
        **DEFAULT_ENVIRONMENT,
        **(environment or {}),
    }

    total_capacity = sum(
        vessel["capacity_tons"]
        for vessel in vessels
    )

    if total_capacity < cargo_demand_tons:
        return {
            "feasible": False,
            "reason": "Insufficient cargo capacity",
        }

    total_fuel_kg = 0.0
    total_fuel_cost = 0.0
    total_operating_cost = 0.0
    total_cost = 0.0
    total_ghg_kg = 0.0

    travel_times = []
    vessel_results = []

    for vessel, speed in zip(
        vessels,
        speeds,
    ):
        min_speed = vessel[
            "min_speed_mps"
        ]

        max_speed = vessel[
            "max_speed_mps"
        ]

        if (
            speed < min_speed
            or speed > max_speed
        ):
            return {
                "feasible": False,
                "reason": (
                    f"Invalid speed for "
                    f"{vessel['vessel_id']}"
                ),
            }

        travel_time_hours = (
            calculate_travel_time_hours(
                distance_km,
                speed,
            )
        )

        fuel_input = {
            "Ship_SpeedOverGround": speed,
            "Ship_SpeedThroughWater": speed,
            **environment,
        }

        predicted_fuel_rate = predict_fuel(
            fuel_input
        )

        fuel_kg = (
            predicted_fuel_rate
            * travel_time_hours
            * 3600.0
        )

        fuel_type = normalize_fuel_type(
            vessel.get("fuel_type")
        )

        fuel_price = get_fuel_price(
            fuel_type
        )

        ghg_factor = get_ghg_factor(
            fuel_type
        )

        fuel_cost = (
            fuel_kg
            * fuel_price
        )

        operating_cost_per_hour = (
            vessel.get(
                "operating_cost_per_hour"
            )
            or 0.0
        )

        operating_cost = (
            operating_cost_per_hour
            * travel_time_hours
        )

        vessel_total_cost = (
            fuel_cost
            + operating_cost
        )

        ghg_kg = (
            fuel_kg
            * ghg_factor
        )

        total_fuel_kg += fuel_kg
        total_fuel_cost += fuel_cost
        total_operating_cost += operating_cost
        total_cost += vessel_total_cost
        total_ghg_kg += ghg_kg

        travel_times.append(
            travel_time_hours
        )

        vessel_results.append({
            "vessel_id": vessel[
                "vessel_id"
            ],
            "vessel_name": vessel[
                "vessel_name"
            ],
            "fuel_type": fuel_type,
            "speed_mps": round(
                speed,
                3
            ),
            "travel_time_hours": round(
                travel_time_hours,
                3
            ),
            "predicted_fuel_rate_kg_per_second": round(
                predicted_fuel_rate,
                6
            ),
            "fuel_kg": round(
                fuel_kg,
                3
            ),
            "fuel_price_per_kg": round(
                fuel_price,
                2
            ),
            "fuel_cost": round(
                fuel_cost,
                2
            ),
            "operating_cost": round(
                operating_cost,
                2
            ),
            "total_cost": round(
                vessel_total_cost,
                2
            ),
            "ghg_factor_kg_per_kg_fuel": round(
                ghg_factor,
                3
            ),
            "ghg_kg": round(
                ghg_kg,
                3
            ),
        })

    total_travel_time = max(
        travel_times
    )

    return {
        "feasible": True,
        "total_capacity_tons": (
            total_capacity
        ),
        "cargo_demand_tons": (
            cargo_demand_tons
        ),
        "capacity_margin_tons": (
            total_capacity
            - cargo_demand_tons
        ),
        "travel_time_hours": round(
            total_travel_time,
            3
        ),
        "total_fuel_kg": round(
            total_fuel_kg,
            3
        ),
        "total_fuel_cost": round(
            total_fuel_cost,
            2
        ),
        "total_operating_cost": round(
            total_operating_cost,
            2
        ),
        "total_cost": round(
            total_cost,
            2
        ),
        "total_ghg_kg": round(
            total_ghg_kg,
            3
        ),
        "vessels": vessel_results,
    }
def calculate_repositioning_metrics(
    vessel,
    speed_mps,
    distance_km,
    environment=None,
):
    """
    Estimate fuel, operating cost, total cost, and GHG emissions
    for an empty-vessel repositioning voyage.

    Uses the same prediction model, fuel prices, and emissions
    factors as the loaded-voyage calculation.
    """
    import math

    distance_km = float(distance_km)
    speed_mps = float(speed_mps)

    if not math.isfinite(distance_km) or distance_km < 0:
        raise ValueError(
            "Repositioning distance must be finite and non-negative."
        )

    if not math.isfinite(speed_mps) or speed_mps <= 0:
        raise ValueError(
            "Repositioning speed must be finite and positive."
        )

    environment_data = {
        **DEFAULT_ENVIRONMENT,
        **(environment or {}),
    }

    travel_time_hours = calculate_travel_time_hours(
        distance_km=distance_km,
        speed_mps=speed_mps,
    )

    if not math.isfinite(travel_time_hours):
        raise ValueError(
            "Unable to calculate a valid repositioning travel time."
        )

    # Use the existing ML fuel prediction model.
    fuel_input = {
        "Ship_SpeedOverGround": speed_mps,
        "Ship_SpeedThroughWater": speed_mps,
        **environment_data,
    }

    predicted_fuel_rate = float(
        predict_fuel(fuel_input)
    )

    if (
        not math.isfinite(predicted_fuel_rate)
        or predicted_fuel_rate < 0
    ):
        raise ValueError(
            "The fuel model returned an invalid repositioning "
            "fuel-consumption prediction."
        )

    fuel_kg = (
        predicted_fuel_rate
        * travel_time_hours
        * 3600.0
    )

    fuel_type = normalize_fuel_type(
        vessel.get("fuel_type")
    )

    fuel_price = get_fuel_price(fuel_type)
    ghg_factor = get_ghg_factor(fuel_type)

    fuel_cost = fuel_kg * fuel_price

    operating_cost_per_hour = float(
        vessel.get("operating_cost_per_hour") or 0.0
    )

    if (
        not math.isfinite(operating_cost_per_hour)
        or operating_cost_per_hour < 0
    ):
        raise ValueError(
            "Operating cost per hour must be finite and non-negative."
        )

    operating_cost = (
        operating_cost_per_hour * travel_time_hours
    )

    total_cost = fuel_cost + operating_cost
    ghg_kg = fuel_kg * ghg_factor

    return {
        "vessel_id": vessel.get("vessel_id"),
        "fuel_type": fuel_type,
        "distance_km": round(distance_km, 3),
        "speed_mps": round(speed_mps, 3),
        "travel_time_hours": round(travel_time_hours, 3),
        "predicted_fuel_rate_kg_per_second": round(
            predicted_fuel_rate, 6
        ),
        "fuel_kg": round(fuel_kg, 3),
        "fuel_price_per_kg": round(fuel_price, 2),
        "fuel_cost": round(fuel_cost, 2),
        "operating_cost": round(operating_cost, 2),
        "total_cost": round(total_cost, 2),
        "ghg_factor_kg_per_kg_fuel": round(
            ghg_factor, 3
        ),
        "ghg_kg": round(ghg_kg, 3),
    }

def generate_speed_options(
    vessel,
    number_of_points=5,
):
    minimum = vessel[
        "min_speed_mps"
    ]

    maximum = vessel[
        "max_speed_mps"
    ]

    if (
        minimum is None
        or maximum is None
    ):
        return []

    if number_of_points <= 1:
        return [minimum]

    step = (
        maximum - minimum
    ) / (
        number_of_points - 1
    )

    return [
        minimum + (
            step * index
        )
        for index in range(
            number_of_points
        )
    ]


def generate_candidates(
    vessels,
    cargo_demand_tons,
    distance_km,
    deadline_hours,
    environment=None,
    max_vessels=None,
):
    if not vessels:
        return []

    if max_vessels is None:
        max_vessels = len(vessels)

    candidates = []

    for fleet_size in range(
        1,
        min(
            max_vessels,
            len(vessels)
        ) + 1,
    ):
        for vessel_combination in itertools.combinations(
            vessels,
            fleet_size
        ):
            capacity = sum(
                vessel[
                    "capacity_tons"
                ]
                for vessel
                in vessel_combination
            )

            if capacity < cargo_demand_tons:
                continue

            speed_options = [
                generate_speed_options(
                    vessel
                )
                for vessel
                in vessel_combination
            ]

            if any(
                not options
                for options
                in speed_options
            ):
                continue

            for speeds in itertools.product(
                *speed_options
            ):
                metrics = (
                    calculate_candidate_metrics(
                        vessel_combination,
                        speeds,
                        distance_km,
                        cargo_demand_tons,
                        environment,
                    )
                )

                if not metrics[
                    "feasible"
                ]:
                    continue

                if (
                    metrics[
                        "travel_time_hours"
                    ]
                    > deadline_hours
                ):
                    continue

                candidates.append({
                    "vessel_ids": [
                        vessel[
                            "vessel_id"
                        ]
                        for vessel
                        in vessel_combination
                    ],
                    "metrics": metrics,
                })

    return candidates


def rank_candidates(candidates):
    return rank_by_green_score(
        candidates
    )


def optimize_baseline(
    vessels,
    cargo_demand_tons,
    distance_km,
    deadline_hours,
    environment=None,
):
    candidates = generate_candidates(
        vessels=vessels,
        cargo_demand_tons=(
            cargo_demand_tons
        ),
        distance_km=distance_km,
        deadline_hours=(
            deadline_hours
        ),
        environment=environment,
    )

    ranked = rank_candidates(
        candidates
    )

    if not ranked:
        return {
            "success": False,
            "message": (
                "No feasible fleet plan found."
            ),
            "candidate_count": 0,
            "best_plan": None,
        }

    return {
        "success": True,
        "message": (
            "Feasible fleet plans generated."
        ),
        "candidate_count": len(
            ranked
        ),
        "best_plan": ranked[0],
        "alternatives": ranked[1:6],
    }