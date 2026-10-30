from typing import Dict, Any, List


def calculate_travel_time(distance_km: float, speed_mps: float) -> float:
    """Calculate travel time in hours."""
    speed_kmh = speed_mps * 3.6
    return distance_km / speed_kmh


def calculate_fuel_consumption(
    predicted_fuel_kg_per_second: float,
    travel_time_hours: float
) -> float:
    """Calculate total fuel consumed during the voyage."""
    travel_time_seconds = travel_time_hours * 3600

    return predicted_fuel_kg_per_second * travel_time_seconds


def evaluate_solution(
    vessel: Dict[str, Any],
    speed_mps: float,
    distance_km: float,
    predicted_fuel_kg_per_second: float,
    fuel_price_per_kg: float,
    emission_factor_kgco2e_per_kgfuel: float
) -> Dict[str, float]:

    travel_time_hours = calculate_travel_time(
        distance_km,
        speed_mps
    )

    total_fuel_kg = calculate_fuel_consumption(
        predicted_fuel_kg_per_second,
        travel_time_hours
    )

    fuel_cost = total_fuel_kg * fuel_price_per_kg

    operating_cost = (
        vessel["operating_cost_per_hour"]
        * travel_time_hours
    )

    total_cost = fuel_cost + operating_cost

    total_ghg_kgco2e = (
        total_fuel_kg
        * emission_factor_kgco2e_per_kgfuel
    )

    return {
        "travel_time_hours": travel_time_hours,
        "total_fuel_kg": total_fuel_kg,
        "fuel_cost": fuel_cost,
        "operating_cost": operating_cost,
        "total_cost": total_cost,
        "total_ghg_kgco2e": total_ghg_kgco2e
    }


def evaluate_fleet_solution(
    vessels: List[Dict[str, Any]],
    speeds_mps: List[float],
    distance_km: float,
    predicted_fuels: List[float],
    fuel_price_per_kg: float,
    emission_factor_kgco2e_per_kgfuel: float,
    cargo_demand_tons: float,
    deadline_hours: float
) -> Dict[str, Any]:
    """
    Evaluate a complete multi-vessel fleet solution.
    """

    # Check that each vessel has a corresponding speed and prediction.
    if len(vessels) != len(speeds_mps):
        raise ValueError("Number of vessels and speeds must match.")

    if len(vessels) != len(predicted_fuels):
        raise ValueError("Number of vessels and fuel predictions must match.")

    # Total cargo capacity
    total_capacity = sum(
        vessel["capacity_tons"]
        for vessel in vessels
    )

    # Capacity constraint
    capacity_feasible = total_capacity >= cargo_demand_tons

    vessel_results = []

    total_fuel = 0.0
    total_cost = 0.0
    total_ghg = 0.0
    maximum_travel_time = 0.0

    for vessel, speed, predicted_fuel in zip(
        vessels,
        speeds_mps,
        predicted_fuels
    ):

        # Check speed limits
        speed_feasible = (
            vessel["min_speed_mps"]
            <= speed
            <= vessel["max_speed_mps"]
        )

        result = evaluate_solution(
            vessel=vessel,
            speed_mps=speed,
            distance_km=distance_km,
            predicted_fuel_kg_per_second=predicted_fuel,
            fuel_price_per_kg=fuel_price_per_kg,
            emission_factor_kgco2e_per_kgfuel=emission_factor_kgco2e_per_kgfuel
        )

        vessel_results.append({
            "vessel_id": vessel["vessel_id"],
            "speed_mps": speed,
            "capacity_tons": vessel["capacity_tons"],
            "speed_feasible": speed_feasible,
            **result
        })

        total_fuel += result["total_fuel_kg"]
        total_cost += result["total_cost"]
        total_ghg += result["total_ghg_kgco2e"]

        maximum_travel_time = max(
            maximum_travel_time,
            result["travel_time_hours"]
        )

    deadline_feasible = maximum_travel_time <= deadline_hours

    feasible = (
        capacity_feasible
        and deadline_feasible
        and all(
            result["speed_feasible"]
            for result in vessel_results
        )
    )

    return {
        "feasible": feasible,
        "capacity_feasible": capacity_feasible,
        "deadline_feasible": deadline_feasible,
        "total_capacity_tons": total_capacity,
        "cargo_demand_tons": cargo_demand_tons,
        "travel_time_hours": maximum_travel_time,
        "total_fuel_kg": total_fuel,
        "total_cost": total_cost,
        "total_ghg_kgco2e": total_ghg,
        "vessels": vessel_results
    }