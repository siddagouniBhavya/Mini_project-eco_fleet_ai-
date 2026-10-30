
import math

import pytest
import planner


@pytest.fixture
def mock_fuel_model(monkeypatch):
    """Use predictable values instead of relying on the ML model."""
    monkeypatch.setattr(
        planner,
        "predict_fuel",
        lambda features: 1.5,
    )
    monkeypatch.setattr(
        planner,
        "get_fuel_price",
        lambda fuel_type: 60.0,
    )
    monkeypatch.setattr(
        planner,
        "get_ghg_factor",
        lambda fuel_type: 1.38,
    )


@pytest.fixture
def sample_vessel():
    return {
        "vessel_id": "V007",
        "vessel_name": "ocean voyager",
        "fuel_type": "Methanol",
        "operating_cost_per_hour": 370,
    }


def test_repositioning_calculates_metrics(
    mock_fuel_model,
    sample_vessel,
):
    """A valid empty trip returns consistent fuel, cost and GHG values."""
    distance_km = 2966.68
    speed_mps = 12.0

    result = planner.calculate_repositioning_metrics(
        vessel=sample_vessel,
        speed_mps=speed_mps,
        distance_km=distance_km,
    )

    expected_hours = planner.calculate_travel_time_hours(
        distance_km=distance_km,
        speed_mps=speed_mps,
    )

    expected_fuel = 1.5 * expected_hours * 3600
    expected_fuel_cost = expected_fuel * 60
    expected_operating_cost = expected_hours * 370
    expected_total_cost = (
        expected_fuel_cost + expected_operating_cost
    )
    expected_ghg = expected_fuel * 1.38

    assert result["vessel_id"] == "V007"
    assert result["distance_km"] == pytest.approx(distance_km)
    assert result["travel_time_hours"] == pytest.approx(
        expected_hours,
        abs=0.001,
    )
    assert result["fuel_kg"] == pytest.approx(
        round(expected_fuel, 3)
    )
    assert result["fuel_cost"] == pytest.approx(
        round(expected_fuel_cost, 2)
    )
    assert result["operating_cost"] == pytest.approx(
        round(expected_operating_cost, 2)
    )
    assert result["total_cost"] == pytest.approx(
        round(expected_total_cost, 2)
    )
    assert result["ghg_kg"] == pytest.approx(
        round(expected_ghg, 3)
    )

    for key in (
        "travel_time_hours",
        "fuel_kg",
        "fuel_cost",
        "operating_cost",
        "total_cost",
        "ghg_kg",
    ):
        assert math.isfinite(result[key])
        assert result[key] >= 0


def test_zero_distance_has_zero_trip_metrics(
    mock_fuel_model,
    sample_vessel,
):
    """A vessel already at its destination needs no empty trip."""
    result = planner.calculate_repositioning_metrics(
        vessel=sample_vessel,
        speed_mps=12.0,
        distance_km=0,
    )

    assert result["distance_km"] == 0
    assert result["travel_time_hours"] == 0
    assert result["fuel_kg"] == 0
    assert result["fuel_cost"] == 0
    assert result["operating_cost"] == 0
    assert result["total_cost"] == 0
    assert result["ghg_kg"] == 0


@pytest.mark.parametrize(
    "distance_km,speed_mps",
    [
        (-10, 12),
        (100, 0),
        (100, -2),
        (float("nan"), 12),
        (100, float("inf")),
    ],
)
def test_invalid_repositioning_inputs_are_rejected(
    sample_vessel,
    distance_km,
    speed_mps,
):
    """Invalid distance and speed values must raise ValueError."""
    with pytest.raises(ValueError):
        planner.calculate_repositioning_metrics(
            vessel=sample_vessel,
            speed_mps=speed_mps,
            distance_km=distance_km,
        )
