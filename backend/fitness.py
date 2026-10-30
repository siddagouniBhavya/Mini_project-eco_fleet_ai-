"""Stable, generation-independent multi-objective Green Score.

The previous implementation normalized each metric using the minimum and
maximum of the current candidate batch. That makes a single candidate score
zero in every category and makes scores incomparable across QIGA generations.

The reference scales below are configurable prototype baselines. Calibrate them
against real route lengths, vessel operating data, and business objectives.
Lower component and Green Scores are better.
"""

from __future__ import annotations

import math
from typing import Any

# Reference magnitudes used to convert unlike units to stable dimensionless
# component scores. These are prototype defaults, not regulatory limits.
FUEL_REFERENCE_KG = 1_000_000.0
GHG_REFERENCE_KG = 2_000_000.0
COST_REFERENCE_INR = 100_000_000.0
TIME_REFERENCE_HOURS = 200.0

FUEL_WEIGHT = 0.40
GHG_WEIGHT = 0.25
COST_WEIGHT = 0.20
TIME_WEIGHT = 0.15


def normalize(value: float, minimum: float, maximum: float) -> float:
    """Min-max normalize a value; retained for compatibility with callers.

    For a constant range, return 0.5 (neutral) rather than 0.0, which falsely
    makes every metric appear optimal when a candidate batch has one item.
    The Green Score below intentionally does not depend on per-batch min/max.
    """
    value = float(value)
    minimum = float(minimum)
    maximum = float(maximum)

    if not all(math.isfinite(x) for x in (value, minimum, maximum)):
        raise ValueError("Normalization values must be finite numbers.")
    if maximum < minimum:
        raise ValueError("maximum must be greater than or equal to minimum.")
    if maximum == minimum:
        return 0.5

    return (value - minimum) / (maximum - minimum)


def _metric_score(value: Any, reference: float, metric_name: str) -> float:
    """Map a non-negative metric to (or including) [0, 1) stably.

    score = value / (value + reference) is monotonic, unit-aware through its
    reference scale, and independent of what other candidates are in a batch.
    """
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Candidate metric '{metric_name}' must be numeric.") from exc

    if not math.isfinite(number):
        raise ValueError(f"Candidate metric '{metric_name}' must be finite.")
    if number < 0:
        raise ValueError(f"Candidate metric '{metric_name}' cannot be negative.")
    if reference <= 0 or not math.isfinite(reference):
        raise ValueError(f"Reference scale for '{metric_name}' must be positive and finite.")

    return number / (number + reference)


def calculate_green_scores(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add stable fuel, GHG, cost, time, and combined Green Scores.

    Scores are comparable across generations because each metric uses fixed
    reference scales rather than the minima and maxima of the current batch.
    The returned candidates are new dictionaries; inputs are not mutated.
    """
    if not candidates:
        return []

    scored_candidates = []
    for candidate in candidates:
        metrics = candidate.get("metrics")
        if not isinstance(metrics, dict):
            raise ValueError("Each candidate must contain a metrics dictionary.")

        fuel_score = _metric_score(
            metrics.get("total_fuel_kg"), FUEL_REFERENCE_KG, "total_fuel_kg"
        )
        ghg_score = _metric_score(
            metrics.get("total_ghg_kg"), GHG_REFERENCE_KG, "total_ghg_kg"
        )
        cost_score = _metric_score(
            metrics.get("total_cost"), COST_REFERENCE_INR, "total_cost"
        )
        time_score = _metric_score(
            metrics.get("travel_time_hours"), TIME_REFERENCE_HOURS,
            "travel_time_hours"
        )

        green_score = (
            FUEL_WEIGHT * fuel_score
            + GHG_WEIGHT * ghg_score
            + COST_WEIGHT * cost_score
            + TIME_WEIGHT * time_score
        )

        scored_candidates.append({
            **candidate,
            "fitness": {
                "fuel_score": round(fuel_score, 6),
                "ghg_score": round(ghg_score, 6),
                "cost_score": round(cost_score, 6),
                "time_score": round(time_score, 6),
                "green_score": round(green_score, 6),
            },
        })

    return scored_candidates


def rank_by_green_score(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return candidates ordered from lowest (best) Green Score to highest."""
    scored = calculate_green_scores(candidates)
    return sorted(scored, key=lambda candidate: candidate["fitness"]["green_score"])
