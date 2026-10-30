"""Fuel prediction utilities for EcoFleet AI.

The trained model and configuration are loaded once. Repeated predictions
for identical inputs are cached because the optimizers evaluate the same
vessel/strategy speeds across many candidate fleets.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import joblib
import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "planning_fuel_model.joblib"
CONFIG_PATH = BASE_DIR / "planning_model_config.json"

# Load once when this module is imported. Paths are anchored to this file,
# so startup does not depend on the current working directory.
planning_model = joblib.load(MODEL_PATH)

with CONFIG_PATH.open("r", encoding="utf-8") as file:
    config = json.load(file)


direction_columns = config["direction_columns"]
processed_features = config["processed_features"]


def _prepare_features(input_data: Mapping[str, Any]) -> pd.DataFrame:
    """Apply the exact feature transformations expected by the trained model."""
    input_df = pd.DataFrame([dict(input_data)])

    missing_direction_columns = [
        col for col in direction_columns if col not in input_df.columns
    ]
    if missing_direction_columns:
        raise ValueError(
            "Missing direction feature(s): "
            + ", ".join(missing_direction_columns)
        )

    # Convert compass direction degrees to cyclic sin/cos features.
    for col in direction_columns:
        radians = np.deg2rad(input_df[col])
        input_df[col + "_sin"] = np.sin(radians)
        input_df[col + "_cos"] = np.cos(radians)

    # Remove original direction columns after encoding.
    input_df = input_df.drop(columns=direction_columns)

    missing_features = [
        col for col in processed_features if col not in input_df.columns
    ]
    if missing_features:
        raise ValueError(
            "Missing model feature(s): " + ", ".join(missing_features)
        )

    # Preserve the training-time feature order.
    return input_df.loc[:, processed_features]


@lru_cache(maxsize=8192)
def _predict_fuel_cached(input_key: str) -> float:
    """Predict one unique input row; repeated identical rows use the cache."""
    input_data = json.loads(input_key)
    features = _prepare_features(input_data)

    raw_prediction = planning_model.predict(features)[0]
    return float(raw_prediction)


def _cache_key(input_data: Mapping[str, Any]) -> str:
    """Create a deterministic cache key for the numeric prediction inputs."""
    try:
        return json.dumps(
            dict(input_data),
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Fuel prediction inputs must be JSON-serializable finite values."
        ) from exc


def predict_fuel(input_data: Mapping[str, Any]) -> float:
    """Predict instantaneous fuel consumption in kg/second.

    Results for identical input dictionaries are cached across optimization
    candidates. The underlying feature engineering and prediction calculation
    are unchanged. Call ``clear_fuel_prediction_cache`` after changing the
    model or prediction configuration in a long-running process.
    """
    if not isinstance(input_data, Mapping):
        raise TypeError("input_data must be a mapping of feature names to values.")

    return _predict_fuel_cached(_cache_key(input_data))


def clear_fuel_prediction_cache() -> None:
    """Clear cached predictions, useful for tests or model/config reloads."""
    _predict_fuel_cached.cache_clear()


def fuel_prediction_cache_info() -> dict[str, int]:
    """Return cache hit/miss statistics for profiling."""
    info = _predict_fuel_cached.cache_info()
    return {
        "hits": info.hits,
        "misses": info.misses,
        "maxsize": info.maxsize or 0,
        "currsize": info.currsize,
    }
