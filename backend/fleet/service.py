import pandas as pd

from .validator import (
    validate_vessel,
    find_duplicate_vessel_ids,
    calculate_readiness,
    get_missing_optimization_fields,
    calculate_optimization_readiness,
)

from .mapper import analyze_column_mapping

from .normalizer import (
    detect_speed_unit,
    detect_weight_unit,
    detect_power_unit,
    convert_speed,
    convert_weight,
    convert_power,
)


def clean_value(value):
    """
    Convert pandas empty values into None.
    """

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    return value


def generate_vessel_id(index, existing_ids):
    """
    Generate a human-readable vessel ID such as V001.

    Existing IDs are never replaced.
    """

    counter = index + 1

    while True:

        candidate = f"V{counter:03d}"

        if candidate not in existing_ids:
            return candidate

        counter += 1


def process_vessels(vessels):

    errors = []
    vessel_readiness = []

    for index, vessel in enumerate(vessels):

        result = validate_vessel(vessel)

        missing_optimization_fields = (
            get_missing_optimization_fields(vessel)
        )

        vessel["optimization_ready"] = (
            len(missing_optimization_fields) == 0
        )

        vessel["missing_optimization_fields"] = (
            missing_optimization_fields
        )

        if not result["valid"]:

            errors.append({
                "row": index + 1,
                "vessel_id": vessel.get("vessel_id"),
                "errors": result["errors"],
            })

        vessel_readiness.append({
            "vessel_id": vessel.get("vessel_id"),
            "vessel_name": vessel.get("vessel_name"),
            "optimization_ready": (
                len(missing_optimization_fields) == 0
            ),
            "missing_optimization_fields": (
                missing_optimization_fields
            ),
        })

    duplicates = find_duplicate_vessel_ids(vessels)

    readiness = calculate_readiness(vessels)

    optimization_readiness = (
        calculate_optimization_readiness(vessels)
    )

    return {
        "vessels": vessels,
        "errors": errors,
        "duplicates": duplicates,
        "readiness": readiness,
        "optimization_readiness": optimization_readiness,
        "vessel_readiness": vessel_readiness,
    }


def read_fleet_file(file_path):

    file_path = str(file_path).lower()

    if file_path.endswith(".csv"):

        dataframe = pd.read_csv(file_path)

    elif file_path.endswith(".xlsx"):

        dataframe = pd.read_excel(file_path)

    else:

        raise ValueError(
            "Unsupported file format. "
            "Please upload a CSV or XLSX file."
        )

    return dataframe.to_dict(
        orient="records"
    )


def analyze_uploaded_columns(records):

    if not records:
        return []

    columns = records[0].keys()

    mappings = []

    for column in columns:

        result = analyze_column_mapping(
            column
        )

        mappings.append(result)

    return mappings


def transform_records(records, mappings):

    if not records:
        return []

    mapping_lookup = {
        item["source_column"]: item["suggested_field"]
        for item in mappings
        if item["suggested_field"] is not None
    }

    transformed = []

    # -------------------------------------------------
    # Collect IDs that already exist in uploaded file
    # -------------------------------------------------

    existing_ids = set()

    for record in records:

        for source_column, raw_value in record.items():

            value = clean_value(raw_value)

            target_field = mapping_lookup.get(
                source_column
            )

            if target_field != "vessel_id":
                continue

            if value is None:
                continue

            value_text = str(value).strip()

            if value_text:
                existing_ids.add(value_text)

    # -------------------------------------------------
    # Transform every uploaded row
    # -------------------------------------------------

    for index, record in enumerate(records):

        vessel = {
            "vessel_id": None,
            "vessel_name": None,
            "vessel_type": "Unknown",

            "capacity_tons": None,
            "deadweight_tonnes": None,
            "engine_power_kw": None,

            "min_speed_mps": None,
            "max_speed_mps": None,

            "fuel_type": None,
            "fuel_consumption": None,

            "operating_cost_per_hour": None,

            "propulsion_type": None,

            "status": "AVAILABLE",
        }

        for source_column, raw_value in record.items():

            value = clean_value(raw_value)

            target_field = mapping_lookup.get(
                source_column
            )

            if target_field is None:
                continue

            # -----------------------------------------
            # Vessel name
            # -----------------------------------------

            if target_field == "vessel_name":

                if value is not None:
                    vessel["vessel_name"] = (
                        str(value).strip()
                    )

            # -----------------------------------------
            # Vessel ID
            # -----------------------------------------

            elif target_field == "vessel_id":

                if value is not None:

                    value_text = str(
                        value
                    ).strip()

                    if value_text:
                        vessel["vessel_id"] = (
                            value_text
                        )

            # -----------------------------------------
            # Vessel type
            # -----------------------------------------

            elif target_field == "vessel_type":

                if value is not None:
                    vessel["vessel_type"] = (
                        str(value).strip()
                    )

            # -----------------------------------------
            # Capacity
            # -----------------------------------------

            elif target_field == "capacity_tons":

                if value is not None:

                    vessel["capacity_tons"] = (
                        float(value)
                    )

            # -----------------------------------------
            # Deadweight
            # -----------------------------------------

            elif target_field == "deadweight_tonnes":

                if value is not None:

                    unit = detect_weight_unit(
                        source_column
                    )

                    if unit is not None:

                        vessel[
                            "deadweight_tonnes"
                        ] = convert_weight(
                            value,
                            unit,
                        )

            # -----------------------------------------
            # Engine power
            # -----------------------------------------

            elif target_field == "engine_power_kw":

                if value is not None:

                    unit = detect_power_unit(
                        source_column
                    )

                    if unit is not None:

                        vessel[
                            "engine_power_kw"
                        ] = convert_power(
                            value,
                            unit,
                        )

            # -----------------------------------------
            # Minimum speed
            # -----------------------------------------

            elif target_field == "min_speed":

                if value is not None:

                    unit = detect_speed_unit(
                        source_column
                    )

                    if unit is not None:

                        vessel[
                            "min_speed_mps"
                        ] = convert_speed(
                            value,
                            unit,
                        )

            # -----------------------------------------
            # Maximum speed
            # -----------------------------------------

            elif target_field == "max_speed":

                if value is not None:

                    unit = detect_speed_unit(
                        source_column
                    )

                    if unit is not None:

                        vessel[
                            "max_speed_mps"
                        ] = convert_speed(
                            value,
                            unit,
                        )

            # -----------------------------------------
            # Fuel type
            # -----------------------------------------

            elif target_field == "fuel_type":

                if value is not None:

                    vessel["fuel_type"] = (
                        str(value).strip()
                    )

            # -----------------------------------------
            # Fuel consumption
            # -----------------------------------------

            elif target_field == "fuel_consumption":

                if value is not None:

                    vessel[
                        "fuel_consumption"
                    ] = float(value)

            # -----------------------------------------
            # Operating cost
            # -----------------------------------------

            elif target_field == (
                "operating_cost_per_hour"
            ):

                if value is not None:

                    vessel[
                        "operating_cost_per_hour"
                    ] = float(value)

            # -----------------------------------------
            # Propulsion
            # -----------------------------------------

            elif target_field == "propulsion_type":

                if value is not None:

                    vessel[
                        "propulsion_type"
                    ] = str(value).strip()

            # -----------------------------------------
            # Status
            # -----------------------------------------

            elif target_field == "status":

                if value is not None:

                    vessel["status"] = (
                        str(value)
                        .strip()
                        .upper()
                    )

        # -------------------------------------------------
        # Automatic ID generation
        # -------------------------------------------------

        if not vessel["vessel_id"]:

            generated_id = generate_vessel_id(
                index,
                existing_ids,
            )

            vessel["vessel_id"] = generated_id

            existing_ids.add(
                generated_id
            )

        transformed.append(vessel)

    return transformed


def process_uploaded_file(file_path):

    records = read_fleet_file(
        file_path
    )

    mappings = analyze_uploaded_columns(
        records
    )

    vessels = transform_records(
        records,
        mappings,
    )

    validation = process_vessels(
        vessels
    )

    return {
        "vessels": validation["vessels"],
        "mappings": mappings,
        "errors": validation["errors"],
        "duplicates": validation["duplicates"],
        "readiness": validation["readiness"],
        "optimization_readiness": (
            validation[
                "optimization_readiness"
            ]
        ),
        "vessel_readiness": (
            validation[
                "vessel_readiness"
            ]
        ),
    }