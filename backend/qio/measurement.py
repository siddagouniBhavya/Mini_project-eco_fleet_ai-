import random
from typing import Dict


def measure_quantum_state(
    probabilities: Dict[str, float],
    random_generator: random.Random | None = None
) -> Dict[str, int]:

    rng = random_generator or random

    selected = {}

    for vessel_id, probability in probabilities.items():

        selected[vessel_id] = (
            1
            if rng.random() < probability
            else 0
        )

    return selected