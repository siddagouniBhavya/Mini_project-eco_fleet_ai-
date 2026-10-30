import math

from fitness import calculate_green_scores
from ga.optimizer import _objective


def test_ga_objective_matches_shared_green_score():
    candidate = {
        "metrics": {
            "total_fuel_kg": 322666.545,
            "total_ghg_kg": 887333,
            "total_cost": 22613319.52,
            "travel_time_hours": 48.475,
        }
    }

    expected = calculate_green_scores(
        [candidate]
    )[0]["fitness"]["green_score"]

    actual = _objective(candidate)

    assert actual == expected
    assert actual == 0.24056


def test_ga_objective_returns_infinity_for_missing_metrics():
    candidate = {
        "metrics": {
            "total_fuel_kg": 1000,
        }
    }

    assert math.isinf(_objective(candidate))


def test_ga_objective_returns_infinity_for_invalid_metrics():
    candidate = {
        "metrics": {
            "total_fuel_kg": float("nan"),
            "total_ghg_kg": 1000,
            "total_cost": 5000,
            "travel_time_hours": 10,
        }
    }

    assert math.isinf(_objective(candidate))