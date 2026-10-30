import random
from typing import List, Dict, Any

from optimizer import evaluate_fleet_solution


class QuantumInspiredOptimizer:
    def __init__(
        self,
        vessels: List[Dict[str, Any]],
        population_size: int = 20,
        generations: int = 30,
        seed: int = 42
    ):
        self.vessels = vessels
        self.population_size = population_size
        self.generations = generations
        self.random = random.Random(seed)

    def create_solution(self) -> Dict[str, Any]:
        """Create one candidate solution."""

        solution = {
            "selected": [],
            "speeds": []
        }

        for vessel in self.vessels:
            selected = self.random.choice([0, 1])

            speed = self.random.uniform(
                vessel["min_speed_mps"],
                vessel["max_speed_mps"]
            )

            solution["selected"].append(selected)
            solution["speeds"].append(speed)

        return solution

    def create_population(self) -> List[Dict[str, Any]]:
        """Create initial population."""

        return [
            self.create_solution()
            for _ in range(self.population_size)
        ]

    def evaluate_candidate(
        self,
        solution: Dict[str, Any],
        distance_km: float,
        cargo_demand_tons: float,
        deadline_hours: float,
        predicted_fuels: List[float],
        fuel_price_per_kg: float,
        emission_factor_kgco2e_per_kgfuel: float
    ) -> Dict[str, Any]:

        selected_vessels = []
        selected_speeds = []
        selected_fuels = []

        for i, selected in enumerate(solution["selected"]):

            if selected == 1:
                selected_vessels.append(self.vessels[i])
                selected_speeds.append(solution["speeds"][i])
                selected_fuels.append(predicted_fuels[i])

        # No vessels selected
        if not selected_vessels:
            return {
                "feasible": False,
                "fitness": float("inf"),
                "reason": "No vessels selected"
            }

        result = evaluate_fleet_solution(
            vessels=selected_vessels,
            speeds_mps=selected_speeds,
            distance_km=distance_km,
            predicted_fuels=selected_fuels,
            fuel_price_per_kg=fuel_price_per_kg,
            emission_factor_kgco2e_per_kgfuel=emission_factor_kgco2e_per_kgfuel,
            cargo_demand_tons=cargo_demand_tons,
            deadline_hours=deadline_hours
        )

        # Simple fitness:
        # lower fuel + lower cost + lower GHG + lower time is better
        if result["feasible"]:

            fitness = (
                result["total_fuel_kg"]
                + result["total_cost"]
                + result["total_ghg_kgco2e"]
                + result["travel_time_hours"]
            )

        else:
            # Large penalty for infeasible solutions
            fitness = (
                result["total_fuel_kg"]
                + result["total_cost"]
                + result["total_ghg_kgco2e"]
                + result["travel_time_hours"]
                + 1_000_000
            )

        result["fitness"] = fitness

        return result