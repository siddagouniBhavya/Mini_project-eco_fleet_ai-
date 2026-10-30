import math
import random
import time
from typing import Any

from planner import calculate_candidate_metrics
from fitness import calculate_green_scores

# Keep computation bounded to help website responsiveness.
DEFAULT_POPULATION_SIZE = 12
DEFAULT_GENERATIONS = 15
DEFAULT_PATIENCE = 5
DEFAULT_MUTATION_RATE = 0.15
DEFAULT_ELITE_COUNT = 2

# Balanced objective weights. Calibrate against real fleet data.
COST_WEIGHT = 0.50
EMISSIONS_WEIGHT = 0.30
TIME_WEIGHT = 0.20


SPEED_STRATEGIES = (
    ("EFFICIENT", 0.25),
    ("BALANCED", 0.50),
    ("FAST", 0.75),
    ("MAXIMUM", 1.00),
)


def _speed_strategies(vessel: dict) -> list[float]:
    """Return speeds for the same four strategies used by QIGA."""
    try:
        minimum = float(vessel["min_speed_mps"])
        maximum = float(vessel["max_speed_mps"])
    except (KeyError, TypeError, ValueError):
        return []

    if not math.isfinite(minimum) or not math.isfinite(maximum):
        return []
    if minimum <= 0 or maximum < minimum:
        return []

    speed_range = maximum - minimum
    return [
        minimum + speed_range * fraction
        for _, fraction in SPEED_STRATEGIES
    ]


def _selection_key(chromosome: dict) -> tuple:
    """Stable representation of a vessel-selection chromosome."""
    return tuple(chromosome["selected"])


def _evaluate_chromosome(
    chromosome: dict,
    vessels: list[dict],
    cargo_demand_tons: float,
    distance_km: float,
    deadline_hours: float,
    environment: dict | None,
) -> list[dict]:
    """Evaluate the selection using four fleet-wide speed strategies."""
    genes = chromosome.get("selected", [])
    if len(genes) != len(vessels):
        return []

    selected_vessels = [
        vessel
        for vessel, selected in zip(vessels, genes)
        if selected
    ]

    if not selected_vessels:
        return []

    total_capacity = sum(
        float(vessel["capacity_tons"])
        for vessel in selected_vessels
    )
    if total_capacity < cargo_demand_tons:
        return []

    speed_options = [
        _speed_strategies(vessel)
        for vessel in selected_vessels
    ]
    if any(not options for options in speed_options):
        return []

    candidates = []
    for strategy_index, (strategy_name, _) in enumerate(SPEED_STRATEGIES):
        speeds = [options[strategy_index] for options in speed_options]

        metrics = calculate_candidate_metrics(
            vessels=selected_vessels,
            speeds=speeds,
            distance_km=distance_km,
            cargo_demand_tons=cargo_demand_tons,
            environment=environment,
        )

        if not metrics.get("feasible", False):
            continue

        try:
            travel_time = float(metrics["travel_time_hours"])
        except (KeyError, TypeError, ValueError):
            continue

        if not math.isfinite(travel_time) or travel_time > deadline_hours:
            continue

        candidates.append({
            "vessel_ids": [vessel["vessel_id"] for vessel in selected_vessels],
            "speed_strategy": strategy_name,
            "metrics": metrics,
        })

    return candidates

def _objective(candidate: dict) -> float:
    """Use the same Green Score as baseline and QIGA; lower is better."""
    try:
        scored_candidates = calculate_green_scores([candidate])
        return float(
            scored_candidates[0]["fitness"]["green_score"]
        )
    except (KeyError, TypeError, ValueError, OverflowError):
        return float("inf")


def _best_candidate(candidates: list[dict]) -> dict | None:
    """Return the lowest-objective candidate with finite metrics."""
    if not candidates:
        return None

    valid_candidates = [candidate for candidate in candidates if math.isfinite(_objective(candidate))]
    if not valid_candidates:
        return None
    return min(valid_candidates, key=_objective)


def _make_chromosome(vessel_count: int, rng: random.Random) -> dict:
    """Create a random binary vessel-selection chromosome."""
    selected = [1 if rng.random() < 0.5 else 0 for _ in range(vessel_count)]
    if selected and not any(selected):
        selected[rng.randrange(vessel_count)] = 1
    return {"selected": selected}


def _repair_chromosome(
    chromosome: dict,
    vessels: list[dict],
    cargo_demand_tons: float,
    rng: random.Random,
) -> dict:
    """Ensure a nonempty selection and add vessels until capacity is enough."""
    selected = chromosome.get("selected", [])[:]
    if len(selected) != len(vessels) or not selected:
        return {"selected": selected}

    if not any(selected):
        selected[rng.randrange(len(selected))] = 1

    capacity = sum(
        float(vessel["capacity_tons"])
        for vessel, bit in zip(vessels, selected)
        if bit
    )

    while capacity < cargo_demand_tons and not all(selected):
        remaining = [index for index, bit in enumerate(selected) if not bit]
        index = rng.choice(remaining)
        selected[index] = 1
        capacity += float(vessels[index]["capacity_tons"])

    return {"selected": selected}


def _tournament_select(
    population: list[dict],
    fitnesses: list[float],
    rng: random.Random,
    tournament_size: int = 3,
) -> dict:
    """Select a chromosome by tournament using aligned population fitnesses."""
    if not population or len(population) != len(fitnesses):
        raise ValueError("Population and fitnesses must be non-empty and aligned.")

    sample_size = min(tournament_size, len(population))
    indices = [rng.randrange(len(population)) for _ in range(sample_size)]
    winner = min(indices, key=lambda index: fitnesses[index])
    return {"selected": population[winner]["selected"][:]}


def _crossover(
    parent_a: dict,
    parent_b: dict,
    rng: random.Random,
) -> tuple[dict, dict]:
    """Perform single-point crossover."""
    genes_a = parent_a["selected"][:]
    genes_b = parent_b["selected"][:]

    if len(genes_a) < 2:
        return ({"selected": genes_a}, {"selected": genes_b})

    point = rng.randint(1, len(genes_a) - 1)
    child_a = genes_a[:point] + genes_b[point:]
    child_b = genes_b[:point] + genes_a[point:]
    return ({"selected": child_a}, {"selected": child_b})


def _mutate(chromosome: dict, mutation_rate: float, rng: random.Random) -> dict:
    """Flip each selection gene with the configured probability."""
    genes = chromosome["selected"][:]
    for index in range(len(genes)):
        if rng.random() < mutation_rate:
            genes[index] = 1 - genes[index]

    if genes and not any(genes):
        genes[rng.randrange(len(genes))] = 1
    return {"selected": genes}


def optimize_ga(
    vessels: list[dict[str, Any]],
    cargo_demand_tons: float,
    distance_km: float,
    deadline_hours: float,
    environment: dict | None = None,
    population_size: int = DEFAULT_POPULATION_SIZE,
    generations: int = DEFAULT_GENERATIONS,
    mutation_rate: float = DEFAULT_MUTATION_RATE,
    elite_count: int = DEFAULT_ELITE_COUNT,
    seed: int | None = 42,
    patience: int = DEFAULT_PATIENCE,
) -> dict[str, Any]:
    """Optimize one shipment; returns the best feasible plan found, not a guaranteed global optimum."""
    start_time = time.perf_counter()

    if not vessels:
        return {
            "success": False,
            "message": "No vessels available.",
            "candidate_count": 0,
            "best_plan": None,
            "runtime_seconds": 0.0,
            "algorithm": "GA",
        }

    if not all(math.isfinite(float(value)) and float(value) > 0 for value in (
        cargo_demand_tons, distance_km, deadline_hours
    )):
        raise ValueError("Cargo demand, distance, and deadline must be finite positive numbers.")
    if population_size < 2:
        raise ValueError("Population size must be at least 2.")
    if generations < 1 or patience < 1:
        raise ValueError("Generations and patience must be positive.")
    if not 0.0 <= mutation_rate <= 1.0:
        raise ValueError("Mutation rate must be between 0 and 1.")
    if not 1 <= elite_count < population_size:
        raise ValueError("Elite count must be at least 1 and less than population size.")

    for vessel in vessels:
        capacity = float(vessel.get("capacity_tons", 0))
        if not math.isfinite(capacity) or capacity <= 0:
            raise ValueError("Every vessel must have finite positive cargo capacity.")
        if not _speed_strategies(vessel):
            raise ValueError(f"Vessel {vessel.get('vessel_id', '<unknown>')} has invalid speed limits.")

    total_fleet_capacity = sum(float(vessel["capacity_tons"]) for vessel in vessels)
    if total_fleet_capacity < cargo_demand_tons:
        return {
            "success": False,
            "message": "Total available vessel capacity is below the shipment cargo demand.",
            "candidate_count": 0,
            "best_plan": None,
            "history": [],
            "generations_completed": 0,
            "runtime_seconds": round(time.perf_counter() - start_time, 4),
            "algorithm": "GA",
        }

    rng = random.Random(seed)

    population = []
    seen = set()
    attempts = 0
    max_attempts = population_size * 20

    while len(population) < population_size and attempts < max_attempts:
        attempts += 1
        chromosome = _repair_chromosome(
            _make_chromosome(len(vessels), rng),
            vessels,
            cargo_demand_tons,
            rng,
        )
        key = _selection_key(chromosome)
        if key not in seen:
            seen.add(key)
            population.append(chromosome)

    while len(population) < population_size:
        population.append(_repair_chromosome(
            _make_chromosome(len(vessels), rng),
            vessels,
            cargo_demand_tons,
            rng,
        ))

    history = []
    all_candidates = []
    candidate_keys = set()
    best_objective = float("inf")
    stagnant_generations = 0
    generations_completed = 0

    for generation in range(1, generations + 1):
        scored_chromosomes = []
        generation_candidates = []

        for chromosome in population:
            candidates = _evaluate_chromosome(
                chromosome=chromosome,
                vessels=vessels,
                cargo_demand_tons=cargo_demand_tons,
                distance_km=distance_km,
                deadline_hours=deadline_hours,
                environment=environment,
            )
            generation_candidates.extend(candidates)
            best_for_chromosome = _best_candidate(candidates)
            fitness = _objective(best_for_chromosome) if best_for_chromosome is not None else float("inf")
            scored_chromosomes.append((chromosome, fitness))

            for candidate in candidates:
                key = (tuple(candidate["vessel_ids"]), candidate["speed_strategy"])
                if key not in candidate_keys:
                    candidate_keys.add(key)
                    all_candidates.append(candidate)

        generations_completed = generation
        generation_best = min((fitness for _, fitness in scored_chromosomes), default=float("inf"))
        improved = generation_best < best_objective
        if improved:
            best_objective = generation_best
            stagnant_generations = 0
        else:
            stagnant_generations += 1

        history.append({
            "generation": generation,
            "population_size": len(population),
            "feasible_candidates": len(generation_candidates),
            "best_objective": None if generation_best == float("inf") else round(generation_best, 6),
            "improved": improved,
        })

        if stagnant_generations >= patience:
            break

        # IMPORTANT: keep each chromosome beside its own fitness score.
        scored_chromosomes.sort(key=lambda item: item[1])
        ranked_population = [chromosome for chromosome, _ in scored_chromosomes]
        fitnesses = [fitness for _, fitness in scored_chromosomes]

        next_population = [
            {"selected": chromosome["selected"][:]}
            for chromosome, _ in scored_chromosomes[:elite_count]
        ]

        while len(next_population) < population_size:
            parent_a = _tournament_select(ranked_population, fitnesses, rng)
            parent_b = _tournament_select(ranked_population, fitnesses, rng)
            child_a, child_b = _crossover(parent_a, parent_b, rng)
            child_a = _mutate(child_a, mutation_rate, rng)
            child_b = _mutate(child_b, mutation_rate, rng)
            child_a = _repair_chromosome(child_a, vessels, cargo_demand_tons, rng)
            child_b = _repair_chromosome(child_b, vessels, cargo_demand_tons, rng)

            next_population.append(child_a)
            if len(next_population) < population_size:
                next_population.append(child_b)

        population = next_population

    best_plan = _best_candidate(all_candidates)
    runtime_seconds = time.perf_counter() - start_time

    if best_plan is None:
        return {
            "success": False,
            "message": "GA could not find a feasible fleet plan.",
            "candidate_count": len(all_candidates),
            "best_plan": None,
            "history": history,
            "generations_completed": generations_completed,
            "runtime_seconds": round(runtime_seconds, 4),
            "algorithm": "GA",
        }

    return {
        "success": True,
        "message": "GA completed. Best feasible solution found.",
        "candidate_count": len(all_candidates),
        "best_plan": best_plan,
        "history": history,
        "generations_completed": generations_completed,
        "runtime_seconds": round(runtime_seconds, 4),
        "algorithm": "GA",
    }
