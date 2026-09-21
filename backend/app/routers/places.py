from fastapi import APIRouter, HTTPException, Query

from app.deps import CurrentUser, DbSession
from app.ml.types import CATEGORIES
from app.places.queries import places_within
from app.schemas import NearbyPlaceOut

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/nearby", response_model=list[NearbyPlaceOut])
def nearby(
    _user: CurrentUser,
    db: DbSession,
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    radius_m: float = Query(default=500, gt=0, le=5000),
    category: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NearbyPlaceOut]:
    """Places from our own OSM index around a point, nearest first. Nothing is sent to a third party."""
    if category is not None and category not in CATEGORIES:
        raise HTTPException(422, f"Unknown category {category!r}")
    return [
        NearbyPlaceOut(
            id=place.id,
            osm_id=place.osm_id,
            name=place.name,
            category=place.category,
            lat=place.lat,
            lon=place.lon,
            distance_m=round(distance, 1),
        )
        for place, distance in places_within(db, lat, lon, radius_m, category=category, limit=limit)
    ]
