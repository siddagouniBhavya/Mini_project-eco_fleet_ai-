from typing import Dict, Any, List

from fitness import calculate_green_scores


def score_population(
    candidates: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Score an entire QIO population using the existing
    multi-objective Green Score system.
    """

    if not candidates:
        return []

    return calculate_green_scores(candidates)


def get_fitness(candidate: Dict[str, Any]) -> float:
    """
    Read the Green Score from an already-scored candidate.

    Lower Green Score = better solution.
    """

    fitness = candidate.get("fitness")

    if not fitness or "green_score" not in fitness:
        raise ValueError(
            "Candidate must be scored before reading fitness."
        )

    return float(fitness["green_score"])


def is_better(
    candidate_a: Dict[str, Any],
    candidate_b: Dict[str, Any]
) -> bool:
    """
    Compare two already-scored candidates.
    """

    return get_fitness(candidate_a) < get_fitness(candidate_b)