from typing import Dict


def update_quantum_state(
    probabilities: Dict[str, float],
    selected: Dict[str, int],
    learning_rate: float = 0.05,
) -> Dict[str, float]:

    updated = {}

    for vessel_id, probability in probabilities.items():

        if selected[vessel_id] == 1:
            new_probability = (
                probability
                + learning_rate
            )
        else:
            new_probability = (
                probability
                - learning_rate
            )

        new_probability = max(
            0.0,
            min(1.0, new_probability)
        )

        updated[vessel_id] = new_probability

    return updated
