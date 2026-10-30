import re
from difflib import SequenceMatcher


FIELD_ALIASES = {

    "vessel_id": [
        "vessel_id",
        "vesselid",
        "ship_id",
        "shipid",
        "imo",
        "imo_number",
    ],

    "vessel_name": [
        "vessel_name",
        "vesselname",
        "ship_name",
        "shipname",
        "ship",
        "vessel",
    ],

    "vessel_type": [
        "vessel_type",
        "vesseltype",
        "ship_type",
        "shiptype",
        "type",
    ],

    "capacity_tons": [
        "capacity",
        "capacity_tons",
        "capacity_tonnes",
        "cargo_capacity",
        "cargo_capacity_tons",
        "cargo_capacity_tonnes",
    ],

    "deadweight_tonnes": [
        "dwt",
        "deadweight",
        "deadweight_tonnes",
        "deadweight_tons",
        "dead_weight",
        "dead_weight_tonnes",
    ],

    "engine_power_kw": [
        "engine_power",
        "engine_power_kw",
        "enginepower",
        "enginepower_kw",
        "main_engine_power",
        "mainengine_power",
        "main_engine_kw",
        "mainengine_kw",
        "mcr",
        "mcr_kw",
    ],

    "min_speed": [
        "min_speed",
        "minimum_speed",
        "speed_min",
        "min_speed_mps",
        "min_speed_ms",
        "min_speed_kmh",
        "min_speed_km_h",
        "min_speed_knots",
        "min_speed_knot",
        "min_speed_kt",
        "min_speed_kts",
        "minspeed",
        "minspeed_kmh",
        "minspeed_knots",
        "speed_min_kmh",
        "speed_min_knots",
        "speed_min_kt",
        "speed_min_mps",
    ],

    "max_speed": [
        "max_speed",
        "maximum_speed",
        "speed_max",
        "max_speed_mps",
        "max_speed_ms",
        "max_speed_kmh",
        "max_speed_km_h",
        "max_speed_knots",
        "max_speed_knot",
        "max_speed_kt",
        "max_speed_kts",
        "maxspeed",
        "maxspeed_kmh",
        "maxspeed_knots",
        "speed_max_kmh",
        "speed_max_knots",
        "speed_max_kt",
        "speed_max_mps",
    ],

    "fuel_type": [
        "fuel_type",
        "fueltype",
        "fuel",
        "fuel_name",
    ],

    "fuel_consumption": [
        "fuel_consumption",
        "fuel_consumption_rate",
        "fuel_rate",
        "fuel_use",
        "fuel_usage",
        "foc",
        "fuel_oil_consumption",
    ],

    "operating_cost_per_hour": [
        "operating_cost",
        "operating_cost_per_hour",
        "cost_per_hour",
        "hourly_cost",
        "operational_cost",
        "operational_cost_per_hour",
    ],

    "propulsion_type": [
        "propulsion",
        "propulsion_type",
        "propulsiontype",
        "engine_type",
        "drive_type",
    ],

    "status": [
        "status",
        "vessel_status",
        "ship_status",
        "availability",
        "availability_status",
    ],
}


def normalize_column_name(column_name):
    """
    Normalize a source column name so that
    small formatting differences do not affect mapping.
    """

    name = str(column_name).strip().lower()

    name = name.replace("-", "_")
    name = name.replace("/", "_")
    name = name.replace(" ", "_")

    name = re.sub(
        r"[^a-z0-9_]",
        "",
        name,
    )

    name = re.sub(
        r"_+",
        "_",
        name,
    )

    return name.strip("_")


def map_column(column_name):
    """
    Return the best exact/alias mapping for a source column.

    Returns:
        {
            "field": standard internal field,
            "confidence": confidence percentage
        }
    """

    normalized = normalize_column_name(
        column_name
    )

    # ---------------------------------------------
    # Exact alias match
    # ---------------------------------------------

    for field, aliases in FIELD_ALIASES.items():

        normalized_aliases = [
            normalize_column_name(alias)
            for alias in aliases
        ]

        if normalized in normalized_aliases:

            return {
                "field": field,
                "confidence": 99.0,
            }

    # ---------------------------------------------
    # No exact match
    # ---------------------------------------------

    return {
        "field": None,
        "confidence": 0.0,
    }


def similarity_score(source_column, alias):
    """
    Calculate similarity between a source column
    and one known alias.
    """

    source = normalize_column_name(
        source_column
    )

    target = normalize_column_name(
        alias
    )

    if not source or not target:
        return 0.0

    return SequenceMatcher(
        None,
        source,
        target,
    ).ratio()


def suggest_column_mapping(column_name):
    """
    Find the closest standard field using
    semantic string similarity.

    Returns:
        {
            "field": ...,
            "confidence": ...
        }
    """

    normalized = normalize_column_name(
        column_name
    )

    if not normalized:

        return {
            "field": None,
            "confidence": 0.0,
        }

    best_field = None
    best_score = 0.0

    for field, aliases in FIELD_ALIASES.items():

        for alias in aliases:

            score = similarity_score(
                normalized,
                alias,
            )

            if score > best_score:

                best_score = score
                best_field = field

    confidence = round(
        best_score * 100,
        2,
    )

    return {
        "field": best_field,
        "confidence": confidence,
    }


def classify_mapping(confidence):
    """
    Decide whether a mapping can be automatically accepted
    or requires manager confirmation.
    """

    if confidence >= 90:

        return "AUTO_ACCEPT"

    if confidence >= 60:

        return "NEEDS_CONFIRMATION"

    return "UNMAPPED"


def analyze_column_mapping(column_name):
    """
    Analyze one uploaded column.

    The result is designed for both the backend
    and the future frontend mapping-review screen.
    """

    exact_result = map_column(
        column_name
    )

    if exact_result["field"] is not None:

        field = exact_result["field"]
        confidence = exact_result["confidence"]

    else:

        suggestion = suggest_column_mapping(
            column_name
        )

        field = suggestion["field"]
        confidence = suggestion["confidence"]

    decision = classify_mapping(
        confidence
    )

    # Do not expose a weak guess as a usable mapping.
    if decision == "UNMAPPED":

        field = None

    return {
        "source_column": column_name,
        "suggested_field": field,
        "confidence": confidence,
        "decision": decision,
    }