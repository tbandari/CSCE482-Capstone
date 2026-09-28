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


class PlaceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None
    category: str
    lat: float
    lon: float


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
    place: PlaceSummary | None = None
    place_confidence: float | None = None


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
    resolved: int
    dropped: dict[str, int]


class StatsResponse(BaseModel):
    points: int
    device_points: int
    visits: int
    first_ts: int | None
    last_ts: int | None


class InterestOut(BaseModel):
    category: str
    weight: float
    visits: int
    dwell_minutes: float
    hidden: bool


class TopPlaceOut(BaseModel):
    place_id: int
    name: str | None
    category: str
    visits: int
    last_visit_ts: int


class ProfileOut(BaseModel):
    generated_at: int
    total_visits: int
    resolved_visits: int
    interests: list[InterestOut]
    top_places: list[TopPlaceOut]


class InterestPatch(BaseModel):
    hidden: bool


class InterestOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str
    hidden: bool


class RecommendationOut(BaseModel):
    place: PlaceSummary
    score: float
    reason: str


class NearbyRecommendationOut(RecommendationOut):
    distance_m: float


class RecommendationsResponse(BaseModel):
    generated_at: int
    items: list[RecommendationOut]


class NearbyRecommendationsResponse(BaseModel):
    generated_at: int
    items: list[NearbyRecommendationOut]


class FeedbackRequest(BaseModel):
    action: Literal["saved", "dismissed"]


class NextPlaceOut(BaseModel):
    place: PlaceSummary
    probability: float
    rank: int


class NextPlacesResponse(BaseModel):
    generated_at: int
    at_ts: int
    predictions: list[NextPlaceOut]


class ExportResponse(BaseModel):
    user: UserOut
    exported_at: int
    points: list[PointOut]
    visits: list[VisitOut]
    interest_overrides: list[InterestOverrideOut]
