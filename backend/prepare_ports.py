
import csv
import json
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads" / "artifacts" / "release" / "csv"
OUTPUT_FILE = Path(__file__).resolve().parent / "ports.json"

SOURCE_FILES = [
    "UNLOCODE CodeListPart1.csv",
    "UNLOCODE CodeListPart2.csv",
    "UNLOCODE CodeListPart3.csv",
]


def parse_coordinate(value, is_latitude):
    """Convert UN/LOCODE coordinates such as 2518N or 05519E to decimal degrees."""
    if not value:
        return None

    value = value.strip().upper()
    if len(value) < 2 or value[-1] not in "NSEW":
        return None

    direction = value[-1]
    digits = value[:-1]

    try:
        if not digits.isdigit():
            return None

        # UN/LOCODE format: latitude DDMMN, longitude DDDMME
        degree_digits = 2 if is_latitude else 3
        if len(digits) != degree_digits + 2:
            return None

        degrees = int(digits[:degree_digits])
        minutes = int(digits[degree_digits:])

        if minutes >= 60:
            return None

        result = degrees + minutes / 60

        if direction in ("S", "W"):
            result = -result

        if is_latitude and abs(result) > 90:
            return None
        if not is_latitude and abs(result) > 180:
            return None

        return round(result, 6)

    except (ValueError, IndexError):
        return None


def clean_row(row):
    """Normalize column names to tolerate differences in CSV headers."""
    return {
        str(key).strip().lstrip("\ufeff").lower().replace(" ", "").replace("_", ""):
        (value or "").strip()
        for key, value in row.items()
        if key is not None
    }



import csv
import json
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads" / "artifacts" / "release" / "csv"
OUTPUT_FILE = Path(__file__).resolve().parent / "ports.json"

SOURCE_FILES = [
    "UNLOCODE CodeListPart1.csv",
    "UNLOCODE CodeListPart2.csv",
    "UNLOCODE CodeListPart3.csv",
]


def parse_coordinate(value, is_latitude):
    if not value:
        return None

    value = value.strip().upper()
    direction = value[-1]

    if direction not in "NSEW":
        return None

    digits = value[:-1]
    degree_digits = 2 if is_latitude else 3

    if len(digits) != degree_digits + 2 or not digits.isdigit():
        return None

    degrees = int(digits[:degree_digits])
    minutes = int(digits[degree_digits:])

    if minutes >= 60:
        return None

    result = degrees + minutes / 60

    if direction in ("S", "W"):
        result = -result

    if is_latitude and abs(result) > 90:
        return None
    if not is_latitude and abs(result) > 180:
        return None

    return round(result, 6)


ports = {}
rows_read = 0
seaport_rows = 0
missing_coordinates = 0

for filename in SOURCE_FILES:
    file_path = SOURCE_DIR / filename

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    with file_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file)

        for row in reader:
            if len(row) < 11:
                continue

            rows_read += 1

            # Official UN/LOCODE files are headerless CSV files.
            country = row[1].strip().upper()
            location_code = row[2].strip().upper()
            name = row[3].strip()
            function = row[6].strip()
            coordinates = row[10].strip()

            # Function position 1 identifies a port.
            if not function.startswith("1"):
                continue

            seaport_rows += 1

            coordinate_parts = coordinates.split()
            if len(coordinate_parts) != 2:
                missing_coordinates += 1
                continue

            latitude = parse_coordinate(
                coordinate_parts[0], is_latitude=True
            )
            longitude = parse_coordinate(
                coordinate_parts[1], is_latitude=False
            )

            if latitude is None or longitude is None:
                missing_coordinates += 1
                continue

            if not country or not location_code or not name:
                continue

            code = country + location_code

            ports[code] = {
                "code": code,
                "name": name,
                "country": country,
                "latitude": latitude,
                "longitude": longitude,
            }

ports_list = sorted(
    ports.values(),
    key=lambda p: (p["name"].casefold(), p["code"])
)

with OUTPUT_FILE.open("w", encoding="utf-8") as file:
    json.dump(ports_list, file, ensure_ascii=False, indent=2)

print("\nPort dataset processing complete!")
print(f"Rows read: {rows_read}")
print(f"Rows marked as seaports: {seaport_rows}")
print(f"Seaport rows with missing/invalid coordinates: {missing_coordinates}")
print(f"Unique ports saved: {len(ports_list)}")
print(f"Output: {OUTPUT_FILE}")

print("\nSample saved ports:")
for port in ports_list[:10]:
    print(
        f'{port["code"]} | {port["name"]} | '
        f'{port["latitude"]}, {port["longitude"]}'
    )
