# Used to normalize different units and data formats

# Standard units used internally by EcoFleet
STANDARD_UNITS = {
    "speed": "mps",
    "weight": "tonnes",
    "power": "kw",
}


def normalize_text(value):
    """Make text easier to search."""
    return str(value).strip().lower()


def detect_speed_unit(column_name):
    """
    Detect speed unit from the column name.

    Returns:
        'knots', 'kmh', 'mph', 'mps', or None
    """

    name = normalize_text(column_name)

    if (
        "knots" in name
        or "knot" in name
        or "_kt" in name
        or name.endswith("kt")
        or "_kts" in name
        or name.endswith("kts")
    ):
        return "knots"

    if (
        "km/h" in name
        or "kmh" in name
        or "kmph" in name
        or "_km_h" in name
    ):
        return "kmh"

    if "mph" in name:
        return "mph"

    if (
        "m/s" in name
        or "mps" in name
        or "_m_s" in name
    ):
        return "mps"

    return None


def detect_weight_unit(column_name):
    """
    Detect weight unit from the column name.

    Returns:
        'kg', 'tonnes', or None
    """

    name = normalize_text(column_name)

    if (
        "kg" in name
        or "kilogram" in name
    ):
        return "kg"

    if (
        "tonnes" in name
        or "tonne" in name
        or "tons" in name
        or "_ton" in name
    ):
        return "tonnes"

    return None


def detect_power_unit(column_name):
    """
    Detect engine-power unit from the column name.

    Returns:
        'kw', 'hp', or None
    """

    name = normalize_text(column_name)

    if (
        "kw" in name
        or "kilowatt" in name
    ):
        return "kw"

    if (
        "hp" in name
        or "horsepower" in name
    ):
        return "hp"

    return None


def convert_speed(value, unit):
    """
    Convert speed to metres per second.
    """

    value = float(value)

    if unit == "mps":
        return value

    if unit == "knots":
        return value * 0.514444

    if unit == "kmh":
        return value / 3.6

    if unit == "mph":
        return value * 0.44704

    raise ValueError(f"Unsupported speed unit: {unit}")


def convert_weight(value, unit):
    """
    Convert weight to tonnes.
    """

    value = float(value)

    if unit == "tonnes":
        return value

    if unit == "kg":
        return value / 1000

    raise ValueError(f"Unsupported weight unit: {unit}")


def convert_power(value, unit):
    """
    Convert engine power to kilowatts.
    """

    value = float(value)

    if unit == "kw":
        return value

    if unit == "hp":
        return value * 0.7457

    raise ValueError(f"Unsupported power unit: {unit}")