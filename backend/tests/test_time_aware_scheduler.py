
import pytest

import main as main_module
from models import MultiShipmentItem


PORTS = {
    "INMAA": {
        "code": "INMAA",
        "name": "Chennai",
        "country": "IN",
        "latitude": 13.083333,
        "longitude": 80.283333,
    },
    "SGSIN": {
        "code": "SGSIN",
        "name": "Singapore",
        "country": "SG",
        "latitude": 1.283333,
        "longitude": 103.85,
    },
    "KRPUS": {
        "code": "KRPUS",
        "name": "Busan",
        "country": "KR",
        "latitude": 35.133333,
        "longitude": 129.05,
    },
}


def make_shipment(ref, origin, destination, departure, deadline):
    return MultiShipmentItem(
        shipment_ref=ref,
        origin_locode=origin,
        destination_locode=destination,
        cargo_demand_tons=5000,
        deadline_hours=deadline,
        departure_time=departure,
    )


def make_plan(duration_hours, speed_mps=12.0):
    return {
        "vessel_ids": ["V007"],
        "speed_strategy": "MAXIMUM",
        "_joint_score": 0.3,
        "metrics": {
            "feasible": True,
            "total_capacity_tons": 7500,
            "cargo_demand_tons": 5000,
            "capacity_margin_tons": 2500,
            "travel_time_hours": duration_hours,
            "total_fuel_kg": 500.0,
            "total_fuel_cost": 30000.0,
            "total_operating_cost": 1000.0,
            "total_cost": 31000.0,
            "total_ghg_kg": 690.0,
            "vessels": [
                {
                    "vessel_id": "V007",
                    "vessel_name": "ocean voyager",
                    "speed_mps": speed_mps,
                    "travel_time_hours": duration_hours,
                }
            ],
        },
    }


def make_context(index, shipment, plan):
    return {
        "index": index,
        "shipment": shipment,
        "shipment_details": {
            "shipment_ref": shipment.shipment_ref,
            "origin": PORTS[shipment.origin_locode],
            "destination": PORTS[shipment.destination_locode],
            "cargo_demand_tons": shipment.cargo_demand_tons,
            "deadline_hours": shipment.deadline_hours,
            "distance_km": 2966.68,
            "route_geometry": None,
        },
        "plans": [plan],
        "deadline_capable_vessels": [],
        "maximum_deadline_capacity": 7500,
        "plan_runtime": 0.01,
    }


@pytest.fixture
def scheduling_mocks(monkeypatch):
    """Make scheduler tests deterministic without the ML prediction model."""

    def fake_sea_route(origin, destination, shipment_index=0):
        if origin["code"] == destination["code"]:
            return 0.0, None
        return 2966.68, None

    def fake_repositioning_metrics(
        vessel,
        speed_mps,
        distance_km,
        environment=None,
    ):
        if distance_km == 0:
            travel_hours = 0.0
            fuel = 0.0
        else:
            travel_hours = 68.673
            fuel = 100.0

        fuel_cost = fuel * 60.0
        operating_cost = travel_hours * 370.0

        return {
            "vessel_id": vessel["vessel_id"],
            "distance_km": round(distance_km, 3),
            "travel_time_hours": travel_hours,
            "fuel_kg": fuel,
            "fuel_cost": fuel_cost,
            "operating_cost": operating_cost,
            "total_cost": fuel_cost + operating_cost,
            "ghg_kg": fuel * 1.38,
        }

    monkeypatch.setattr(
        main_module,
        "calculate_sea_route",
        fake_sea_route,
    )
    monkeypatch.setattr(
        main_module,
        "calculate_repositioning_metrics",
        fake_repositioning_metrics,
    )


@pytest.fixture
def vessel_records():
    return [
        {
            "vessel_id": "V007",
            "vessel_name": "ocean voyager",
            "fuel_type": "Methanol",
            "operating_cost_per_hour": 370,
            "current_port_locode": "SGSIN",
            "location_updated_at": "2026-10-19T11:00:00+05:30",
        }
    ]


def test_vessel_cannot_depart_before_repositioning_arrival(
    scheduling_mocks,
    vessel_records,
):
    """Reject a Chennai departure that occurs before the empty trip arrives."""

    shipment = make_shipment(
        "TOO-EARLY",
        "INMAA",
        "SGSIN",
        "2026-10-20T08:00:00+05:30",
        72,
    )

    plan = make_plan(duration_hours=68.673)
    context = make_context(1, shipment, plan)

    result = main_module.joint_allocate_time_aware_plans(
        shipment_items=[shipment],
        plans_by_shipment=[[plan]],
        shipment_contexts=[context],
        vessel_records=vessel_records,
        ports_by_code=PORTS,
        turnaround_hours=6,
        scoring_policy="GA",
    )

    # V007 is in Singapore and cannot reach Chennai by October 20.
    assert 0 not in result


def test_vessel_can_be_reused_on_later_shipment(
    scheduling_mocks,
    vessel_records,
):
    """Verify repositioning costs are added and V007 can later be reused."""

    first = make_shipment(
        "FIRST",
        "INMAA",
        "SGSIN",
        "2026-10-23T08:00:00+05:30",
        72,
    )

    second = make_shipment(
        "SECOND",
        "SGSIN",
        "KRPUS",
        "2026-10-30T08:00:00+05:30",
        150,
    )

    first_plan = make_plan(duration_hours=68.673)
    second_plan = make_plan(
        duration_hours=137.37,
        speed_mps=9.5,
    )

    contexts = [
        make_context(1, first, first_plan),
        make_context(2, second, second_plan),
    ]

    result = main_module.joint_allocate_time_aware_plans(
        shipment_items=[first, second],
        plans_by_shipment=[
            [first_plan],
            [second_plan],
        ],
        shipment_contexts=contexts,
        vessel_records=vessel_records,
        ports_by_code=PORTS,
        turnaround_hours=6,
        scoring_policy="GA",
    )

    assert set(result.keys()) == {0, 1}

    first_result = result[0]
    first_reposition = (
        first_result["schedule_details"]
        ["repositioning_by_vessel"]["V007"]
    )

    assert first_reposition["from_port"] == "SGSIN"
    assert first_reposition["to_port"] == "INMAA"
    assert first_reposition["distance_km"] == pytest.approx(
        2966.68
    )
    assert first_reposition["initial_location_assumed_at_origin"] is False

    # The second shipment starts in Singapore, where the first
    # shipment leaves the vessel. No empty trip is needed.
    second_result = result[1]
    second_reposition = (
        second_result["schedule_details"]
        ["repositioning_by_vessel"]["V007"]
    )

    assert second_reposition["from_port"] == "SGSIN"
    assert second_reposition["to_port"] == "SGSIN"
    assert second_reposition["distance_km"] == 0
    assert second_reposition["fuel_kg"] == 0

    # Empty-trip fuel and costs must be reflected in the first plan totals.
    assert first_result["metrics"]["repositioning_totals"]["fuel_kg"] == 100
    assert first_result["metrics"]["total_fuel_kg"] == 600
    assert first_result["metrics"]["total_cost"] > 31000
    assert first_result["metrics"]["total_ghg_kg"] == pytest.approx(828)
