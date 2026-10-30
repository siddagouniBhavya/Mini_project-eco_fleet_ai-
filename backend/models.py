from typing import Literal
from datetime import datetime
from pydantic import (
    BaseModel,
    Field,
    field_validator,
    model_validator,
)

class ShipmentRequest(BaseModel):
    cargo_demand_tons: float = Field(gt=0)
    origin: str
    destination: str
    distance_km: float = Field(gt=0)
    deadline_hours: float = Field(gt=0)


class FuelPredictionRequest(BaseModel):
    Ship_SpeedOverGround: float
    Ship_SpeedThroughWater: float
    Ship_Heading: float
    Ship_Bearing: float

    Weather_WindSpeed10M: float
    Weather_WindDirection10M: float
    Weather_WaveHeight: float
    Weather_WaveDirection: float
    Weather_WavePeriod: float

    Weather_OceanCurrentVelocity: float
    Weather_OceanCurrentDirection: float

    Weather_Temperature2M: float
    Weather_SurfacePressure: float
    Weather_Precipitation: float

    Environment_SeaFloorDepth: float


class Vessel(BaseModel):
    vessel_id: str
    vessel_name: str

    vessel_type: str = "Unknown"
    current_port_locode: str | None = None
    location_updated_at: datetime | None = None
    capacity_tons: float = Field(gt=0)

    deadweight_tonnes: float | None = Field(
        default=None,
        gt=0
    )

    engine_power_kw: float | None = Field(
        default=None,
        gt=0
    )

    min_speed_mps: float = Field(gt=0)
    max_speed_mps: float = Field(gt=0)

    fuel_type: str | None = None

    fuel_consumption: float | None = Field(
        default=None,
        gt=0
    )

    operating_cost_per_hour: float | None = Field(
        default=None,
        gt=0
    )

    propulsion_type: str | None = None

    status: str = "AVAILABLE"

    @field_validator("max_speed_mps")
    @classmethod
    def validate_max_speed(cls, value, info):
        min_speed = info.data.get("min_speed_mps")

        if min_speed is not None and value <= min_speed:
            raise ValueError(
                "Maximum speed must be greater than minimum speed"
            )

        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        value = value.upper()

        allowed_statuses = {
            "AVAILABLE",
            "ON_VOYAGE",
            "MAINTENANCE",
            "UNAVAILABLE",
        }

        if value not in allowed_statuses:
            raise ValueError(
                f"Status must be one of: "
                f"{', '.join(sorted(allowed_statuses))}"
            )

        return value

class OptimizationRequest(BaseModel):
    cargo_demand_tons: float = Field(gt=0)
    origin: str
    destination: str
    distance_km: float = Field(gt=0)
    deadline_hours: float = Field(gt=0)

    environment: dict | None = None



class MultiShipmentItem(BaseModel):
    """Details for one shipment in a batch."""

    shipment_ref: str | None = Field(
        default=None,
        min_length=1,
        max_length=80,
    )

    origin_locode: str = Field(
        min_length=5,
        max_length=5,
    )

    destination_locode: str = Field(
        min_length=5,
        max_length=5,
    )

    cargo_demand_tons: float = Field(gt=0)
    deadline_hours: float = Field(gt=0)

    # Optional departure timestamp for time-aware vessel scheduling.
    departure_time: datetime | None = None

    @field_validator("origin_locode", "destination_locode")
    @classmethod
    def normalize_locode(cls, value: str) -> str:
        value = value.strip().upper()

        if (
            len(value) != 5
            or not value[:2].isalpha()
            or not value.isalnum()
        ):
            raise ValueError(
                "Port must use a valid 5-character UN/LOCODE format."
            )

        return value

    @field_validator("departure_time")
    @classmethod
    def validate_departure_time(
        cls,
        value: datetime | None,
    ) -> datetime | None:
        if value is not None and (
            value.tzinfo is None or value.utcoffset() is None
        ):
            raise ValueError(
                "departure_time must include a timezone offset, "
                "for example 2026-10-20T08:00:00+05:30"
            )

        return value

    @model_validator(mode="after")
    def validate_different_ports(self):
        if self.origin_locode == self.destination_locode:
            raise ValueError(
                "Origin and destination ports must be different."
            )

        return self


class MultiShipmentOptimizationRequest(BaseModel):
    """Request for optimizing multiple shipments together."""

    algorithm: Literal["GA", "QIGA"] = "QIGA"

    shipments: list[MultiShipmentItem] = Field(
        min_length=1,
        max_length=100,
    )
