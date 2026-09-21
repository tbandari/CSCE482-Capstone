from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.config import settings

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime


class PointIn(BaseModel):
    ts: int = Field(ge=0, description="Epoch milliseconds, UTC")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    altitude: float | None = None
    speed: float | None = Field(default=None, ge=0)
    source: Literal["device", "import"] = "device"
    import_id: str | None = Field(default=None, max_length=64)


class PointBatch(BaseModel):
    points: list[PointIn] = Field(min_length=1, max_length=settings.max_batch_size)


class IngestResponse(BaseModel):
    received: int
    inserted: int
    duplicates: int


class PointOut(PointIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_ts: int
    end_ts: int
    lat: float
    lon: float
    radius: float
    point_count: int
    label: str | None


class NearbyPlaceOut(BaseModel):
    id: int
    osm_id: str
    name: str | None
    category: str
    lat: float
    lon: float
    distance_m: float


class RecomputeResponse(BaseModel):
    points: int
    kept: int
    visits: int
    dropped: dict[str, int]


class StatsResponse(BaseModel):
    points: int
    device_points: int
    visits: int
    first_ts: int | None
    last_ts: int | None


class ExportResponse(BaseModel):
    user: UserOut
    exported_at: int
    points: list[PointOut]
    visits: list[VisitOut]
