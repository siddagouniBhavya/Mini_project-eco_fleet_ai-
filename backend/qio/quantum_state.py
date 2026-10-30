from typing import Dict, List


class QuantumState:

    def __init__(self, vessels: List[Dict]):
        self.vessels = vessels

        self.probabilities = {
            vessel["vessel_id"]: 0.5
            for vessel in vessels
        }

    def get_probability(self, vessel_id: str) -> float:
        return self.probabilities[vessel_id]

    def set_probability(
        self,
        vessel_id: str,
        probability: float
    ) -> None:

        if not 0.0 <= probability <= 1.0:
            raise ValueError(
                "Probability must be between 0 and 1."
            )

        self.probabilities[vessel_id] = probability

    def get_state(self) -> Dict[str, float]:
        return self.probabilities.copy()