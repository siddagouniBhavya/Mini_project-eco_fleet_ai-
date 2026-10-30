ALLOWED_STATUSES = {
    "AVAILABLE",
    "ON_VOYAGE",
    "MAINTENANCE",
    "UNAVAILABLE",
}

# Needed to identify a vessel.
IDENTITY_FIELDS = [
    "vessel_id",
    "vessel_name",
]

# Needed before the vessel can participate in optimization.
OPTIMIZATION_FIELDS = [
    "capacity_tons",
    "min_speed_mps",
    "max_speed_mps",
]


def validate_vessel(vessel):
    """
    Validate the basic integrity of a vessel.

    A vessel can be imported even if some optimization
    fields are missing. Missing optimization fields are
    reported separately.
    """

    errors = []

    # -------------------------
    # Identity validation
    # -------------------------

    for field in IDENTITY_FIELDS:

        if field not in vessel:
            errors.append(
                f"Missing required field: {field}"
            )

    if errors:
        return {
            "valid": False,
            "errors": errors,
        }

    if not str(vessel["vessel_id"]).strip():
        errors.append(
            "Vessel ID cannot be empty"
        )

    if not str(vessel["vessel_name"]).strip():
        errors.append(
            "Vessel name cannot be empty"
        )

    # -------------------------
    # Validate fields that exist
    # -------------------------

    numeric_fields = [
        "capacity_tons",
        "min_speed_mps",
        "max_speed_mps",
        "deadweight_tonnes",
        "engine_power_kw",
        "fuel_consumption",
        "operating_cost_per_hour",
    ]

    for field in numeric_fields:

        value = vessel.get(field)

        # Missing optional/incomplete data is allowed.
        if value is None:
            continue

        try:

            numeric_value = float(value)

            if numeric_value <= 0:

                errors.append(
                    f"{field} must be greater than zero"
                )

        except (TypeError, ValueError):

            errors.append(
                f"{field} must be a valid number"
            )

    # -------------------------
    # Speed relationship
    # -------------------------

    min_speed = vessel.get("min_speed_mps")
    max_speed = vessel.get("max_speed_mps")

    if min_speed is not None and max_speed is not None:

        try:

            if float(max_speed) <= float(min_speed):

                errors.append(
                    "Maximum speed must be greater than minimum speed"
                )

        except (TypeError, ValueError):

            pass

    # -------------------------
    # Status validation
    # -------------------------

    status = vessel.get(
        "status",
        "AVAILABLE"
    )

    status = str(status).upper().strip()

    if status not in ALLOWED_STATUSES:

        errors.append(
            f"Invalid status: {status}"
        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }


def get_missing_optimization_fields(vessel):
    """
    Return optimization fields that are missing.
    """

    missing = []

    for field in OPTIMIZATION_FIELDS:

        value = vessel.get(field)

        if value is None or str(value).strip() == "":
            missing.append(field)

    return missing


def calculate_optimization_readiness(vessels):
    """
    Percentage of vessels containing all fields
    required by the optimizer.
    """

    if not vessels:
        return 0.0

    ready_count = 0

    for vessel in vessels:

        missing = get_missing_optimization_fields(
            vessel
        )

        if not missing:
            ready_count += 1

    return round(
        (ready_count / len(vessels)) * 100,
        2,
    )


def find_duplicate_vessel_ids(vessels):

    seen = set()
    duplicates = set()

    for vessel in vessels:

        raw_vessel_id = vessel.get(
            "vessel_id"
        )

        if raw_vessel_id is None:
            continue

        vessel_id = str(
            raw_vessel_id
        ).strip()

        if not vessel_id:
            continue

        if vessel_id in seen:
            duplicates.add(vessel_id)

        seen.add(vessel_id)

    return sorted(duplicates)


def calculate_readiness(vessels):
    """
    Basic fleet-data validity readiness.
    """

    if not vessels:
        return 0.0

    valid_count = 0

    for vessel in vessels:

        result = validate_vessel(vessel)

        if result["valid"]:
            valid_count += 1

    return round(
        (valid_count / len(vessels)) * 100,
        2,
    )