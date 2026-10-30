import random
import time
from typing import Dict, List, Any

from qio.quantum_state import QuantumState
from qio.measurement import measure_quantum_state
from qio.fitness import score_population

from planner import calculate_candidate_metrics


def generate_population(
    vessels: List[Dict[str, Any]],
    population_size: int = 20,
    seed: int | None = None,
) -> List[Dict[str, int]]:
    """
    Generate an initial population using
    quantum-inspired probability measurement.
    """

    if not vessels:
        raise ValueError("No vessels available.")

    if population_size <= 0:
        raise ValueError(
            "Population size must be greater than zero."
        )

    rng = random.Random(seed)

    quantum_state = QuantumState(vessels)
    probabilities = quantum_state.get_state()

    population = []
    population_keys = set()

    attempts = 0
    max_attempts = population_size * 10

    while (
        len(population) < population_size
        and attempts < max_attempts
    ):
        attempts += 1

        selection = measure_quantum_state(
            probabilities,
            random_generator=rng,
        )

        # Never allow an empty chromosome.
        if sum(selection.values()) == 0:
            vessel_ids = list(selection.keys())
            selected_vessel = rng.choice(vessel_ids)
            selection[selected_vessel] = 1

        key = selection_key(selection)

        # Avoid duplicate chromosomes.
        if key in population_keys:
            continue

        population_keys.add(key)
        population.append(selection)

    # If probability convergence creates duplicates,
    # fill remaining positions anyway.
    while len(population) < population_size:

        selection = measure_quantum_state(
            probabilities,
            random_generator=rng,
        )

        # Never allow an empty chromosome.
        if sum(selection.values()) == 0:
            vessel_ids = list(selection.keys())
            selected_vessel = rng.choice(vessel_ids)
            selection[selected_vessel] = 1

        population.append(selection)

    return population


def selection_key(
    selection: Dict[str, int],
) -> tuple:
    """
    Stable chromosome representation.
    """

    return tuple(
        sorted(selection.items())
    )


def get_selected_vessels(
    vessels: List[Dict[str, Any]],
    selection: Dict[str, int],
) -> List[Dict[str, Any]]:
    """
    Convert a binary chromosome into selected vessels.
    """

    return [
        vessel
        for vessel in vessels
        if selection.get(
            vessel["vessel_id"],
            0,
        ) == 1
    ]


def generate_speed_strategies(
    vessels: List[Dict[str, Any]],
) -> List[tuple[str, List[float]]]:
    """
    Generate four fleet-level speed strategies:
    EFFICIENT, BALANCED, FAST, and MAXIMUM.
    """

    strategies = [
        ("EFFICIENT", 0.25),
        ("BALANCED", 0.50),
        ("FAST", 0.75),
        ("MAXIMUM", 1.00),
    ]

    results = []

    for name, fraction in strategies:
        speeds = []

        for vessel in vessels:
            minimum = vessel["min_speed_mps"]
            maximum = vessel["max_speed_mps"]

            speed = minimum + fraction * (maximum - minimum)
            speeds.append(speed)

        results.append((name, speeds))

    return results


def evaluate_selection(
    vessels: List[Dict[str, Any]],
    selection: Dict[str, int],
    cargo_demand_tons: float,
    distance_km: float,
    deadline_hours: float,
    environment: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    """
    Evaluate the exact fleet represented by one chromosome.

    For every selected fleet, three fleet-level speed
    strategies are evaluated:

        1. EFFICIENT
        2. BALANCED
        3. FAST

    This keeps the QIGA computational cost manageable
    while still considering different operating speeds.
    """

    selected_vessels = get_selected_vessels(
        vessels,
        selection,
    )

    # Empty chromosome is not feasible.
    if not selected_vessels:
        return []

    # ---------------------------------------------
    # Capacity feasibility
    # ---------------------------------------------

    total_capacity = sum(
        vessel["capacity_tons"]
        for vessel in selected_vessels
    )

    if total_capacity < cargo_demand_tons:
        return []

    # ---------------------------------------------
    # Generate speed strategies
    # ---------------------------------------------

    speed_strategies = generate_speed_strategies(
        selected_vessels
    )

    if not speed_strategies:
        return []

    candidates = []

    # ---------------------------------------------
    # Evaluate all three strategies
    # ---------------------------------------------

    for strategy_name, speeds in speed_strategies:

        metrics = calculate_candidate_metrics(
            vessels=selected_vessels,
            speeds=speeds,
            distance_km=distance_km,
            cargo_demand_tons=cargo_demand_tons,
            environment=environment,
        )

        # Candidate must satisfy all internal
        # feasibility checks.
        if not metrics["feasible"]:
            continue

        # -----------------------------------------
        # Deadline constraint
        # -----------------------------------------

        if metrics["travel_time_hours"] > deadline_hours:
            continue

        # -----------------------------------------
        # Create candidate
        # -----------------------------------------

        candidate = {
            "vessel_ids": [
                vessel["vessel_id"]
                for vessel in selected_vessels
            ],
            "speed_strategy": strategy_name,
            "metrics": metrics,
        }

        candidates.append(candidate)

    return candidates


def update_toward_elite(
    probabilities: Dict[str, float],
    elite_selection: Dict[str, int],
    learning_rate: float,
) -> Dict[str, float]:
    """
    Move quantum-inspired probabilities toward
    the global elite chromosome.

    If a vessel belongs to the elite solution,
    its probability moves toward 1.

    If it does not belong to the elite solution,
    its probability moves toward 0.
    """

    updated = {}

    for vessel_id, probability in probabilities.items():

        target = elite_selection.get(
            vessel_id,
            0,
        )

        if target == 1:

            new_probability = (
                probability
                + learning_rate
                * (1.0 - probability)
            )

        else:

            new_probability = (
                probability
                - learning_rate
                * probability
            )

        updated[vessel_id] = max(
            0.0,
            min(1.0, new_probability),
        )

    return updated


def optimize_qiga(
    vessels: List[Dict[str, Any]],
    cargo_demand_tons: float,
    distance_km: float,
    deadline_hours: float,
    environment: Dict[str, Any] | None = None,
    population_size: int = 20,
    generations: int = 30,
    learning_rate: float = 0.05,
    seed: int | None = 42,
    patience: int = 8,
) -> Dict[str, Any]:
    """
    Quantum-Inspired Genetic Algorithm for fleet optimization.

    Each chromosome represents one complete fleet-selection
    decision.

    Workflow:

        1. Initialize quantum-inspired probabilities.
        2. Measure chromosomes.
        3. Convert chromosomes into vessel selections.
        4. Check capacity feasibility.
        5. Evaluate three speed strategies.
        6. Predict fuel using the ML model.
        7. Calculate fuel, cost, GHG and travel time.
        8. Calculate Green Score for the population.
        9. Preserve the global elite.
        10. Update probabilities toward the elite.
        11. Repeat until generations are completed
            or early stopping occurs.

    Lower Green Score is better.
    """

    start_time = time.perf_counter()

    # ---------------------------------------------
    # Basic validation
    # ---------------------------------------------

    if not vessels:
        return {
            "success": False,
            "message": "No vessels available.",
            "candidate_count": 0,
            "best_plan": None,
        }

    if population_size <= 0:
        raise ValueError(
            "Population size must be greater than zero."
        )

    if generations <= 0:
        raise ValueError(
            "Generations must be greater than zero."
        )

    if patience <= 0:
        raise ValueError(
            "Patience must be greater than zero."
        )

    if learning_rate <= 0 or learning_rate > 1:
        raise ValueError(
            "Learning rate must be greater than 0 and at most 1."
        )

    # ---------------------------------------------
    # Quantum-inspired initialization
    # ---------------------------------------------

    quantum_state = QuantumState(vessels)

    probabilities = quantum_state.get_state()

    rng = random.Random(seed)

    # ---------------------------------------------
    # Global elite
    # ---------------------------------------------

    global_best = None
    global_best_fitness = float("inf")

    # ---------------------------------------------
    # Generation history
    # ---------------------------------------------

    history = []

    # Total number of feasible candidates evaluated
    # across all generations.
    total_evaluated_candidates = 0

    # Number of generations without improvement.
    stagnant_generations = 0

    # ---------------------------------------------
    # QIGA generations
    # ---------------------------------------------

    for generation in range(
        1,
        generations + 1,
    ):

        # -----------------------------------------
        # Generate population
        # -----------------------------------------

        population = []

        population_keys = set()

        attempts = 0
        max_attempts = population_size * 10

        # -----------------------------------------
        # Measure quantum-inspired chromosomes
        # -----------------------------------------

        while (
            len(population) < population_size
            and attempts < max_attempts
        ):

            attempts += 1

            selection = measure_quantum_state(
                probabilities,
                random_generator=rng,
            )

            # Never allow empty chromosome.
            if sum(selection.values()) == 0:

                vessel_ids = list(
                    selection.keys()
                )

                selected_vessel = rng.choice(
                    vessel_ids
                )

                selection[selected_vessel] = 1

            key = selection_key(selection)

            # Avoid duplicate chromosomes
            # within the generation.
            if key in population_keys:
                continue

            population_keys.add(key)

            population.append(selection)

        # -----------------------------------------
        # Fill remaining population if necessary
        # -----------------------------------------

        while len(population) < population_size:

            selection = measure_quantum_state(
                probabilities,
                random_generator=rng,
            )

            # Never allow empty chromosome.
            if sum(selection.values()) == 0:

                vessel_ids = list(
                    selection.keys()
                )

                selected_vessel = rng.choice(
                    vessel_ids
                )

                selection[selected_vessel] = 1

            population.append(selection)

        # -----------------------------------------
        # Evaluate population
        # -----------------------------------------

        evaluated_candidates = []

        for selection in population:

            candidates = evaluate_selection(
                vessels=vessels,
                selection=selection,
                cargo_demand_tons=cargo_demand_tons,
                distance_km=distance_km,
                deadline_hours=deadline_hours,
                environment=environment,
            )

            evaluated_candidates.extend(
                candidates
            )

        total_evaluated_candidates += len(
            evaluated_candidates
        )

        # -----------------------------------------
        # No feasible candidate
        # -----------------------------------------

        if not evaluated_candidates:

            stagnant_generations += 1

            history.append(
                {
                    "generation": generation,
                    "population_size": len(
                        population
                    ),
                    "feasible_candidates": 0,
                    "best_green_score": None,
                    "global_best_green_score": (
                        None
                        if global_best is None
                        else round(
                            global_best_fitness,
                            6,
                        )
                    ),
                    "improved": False,
                }
            )

            # Early stopping.
            if stagnant_generations >= patience:
                break

            continue

        # -----------------------------------------
        # Calculate Green Score for entire
        # evaluated population
        # -----------------------------------------

        scored_population = score_population(
            evaluated_candidates
        )

        # -----------------------------------------
        # Find best candidate in this generation
        # -----------------------------------------

        generation_best = min(
            scored_population,
            key=lambda candidate:
                candidate["fitness"][
                    "green_score"
                ],
        )

        generation_best_fitness = float(
            generation_best["fitness"][
                "green_score"
            ]
        )

        improved = False

        # -----------------------------------------
        # ELITISM
        #
        # Keep the best solution ever found.
        # -----------------------------------------

        if (
            global_best is None
            or generation_best_fitness
            < global_best_fitness
        ):

            global_best = generation_best

            global_best_fitness = (
                generation_best_fitness
            )

            improved = True

            stagnant_generations = 0

        else:

            stagnant_generations += 1

        # -----------------------------------------
        # Generation history
        # -----------------------------------------

        history.append(
            {
                "generation": generation,
                "population_size": len(
                    population
                ),
                "feasible_candidates": len(
                    scored_population
                ),
                "best_green_score": round(
                    generation_best_fitness,
                    6,
                ),
                "global_best_green_score": round(
                    global_best_fitness,
                    6,
                ),
                "improved": improved,
            }
        )

        # -----------------------------------------
        # Update quantum-inspired probabilities
        # toward the global elite
        # -----------------------------------------

        elite_selection = {
            vessel["vessel_id"]:
                (
                    1
                    if vessel["vessel_id"]
                    in global_best["vessel_ids"]
                    else 0
                )
            for vessel in vessels
        }

        probabilities = update_toward_elite(
            probabilities=probabilities,
            elite_selection=elite_selection,
            learning_rate=learning_rate,
        )

        # -----------------------------------------
        # Early stopping
        # -----------------------------------------

        if stagnant_generations >= patience:
            break

    # ---------------------------------------------
    # Final runtime
    # ---------------------------------------------

    runtime_seconds = (
        time.perf_counter()
        - start_time
    )

    # ---------------------------------------------
    # No solution found
    # ---------------------------------------------

    if global_best is None:

        return {
            "success": False,
            "message": (
                "QIGA could not find a feasible "
                "fleet plan."
            ),
            "candidate_count":
                total_evaluated_candidates,
            "best_plan": None,
            "final_probabilities":
                probabilities,
            "history": history,
            "generations_completed":
                len(history),
            "runtime_seconds":
                round(runtime_seconds, 4),
        }

    # ---------------------------------------------
    # Successful result
    # ---------------------------------------------

    return {
        "success": True,
        "message": (
            "QIGA completed successfully. "
            "Best solution found."
        ),
        "candidate_count":
            total_evaluated_candidates,
        "best_plan": global_best,
        "final_probabilities":
            probabilities,
        "history": history,
        "generations_completed":
            len(history),
        "runtime_seconds":
            round(runtime_seconds, 4),
    }