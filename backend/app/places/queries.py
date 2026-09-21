"""
Spatial queries over the place index.

Portable across SQLite and PostgreSQL: a bounding-box prefilter that the
(lat, lon) index can serve, then exact haversine distances in Python. Part 2
replaces the prefilter with PostGIS `ST_DWithin` on a geography column + GiST
index; callers won't change.
"""

from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Place
from app.stays import haversine_m

METERS_PER_DEGREE_LAT = 111_320.0


def bounding_box(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    """(south, west, north, east) that contains every point within radius_m. Slightly generous by design."""
    d_lat = radius_m / METERS_PER_DEGREE_LAT
    # Near the poles cos(lat) -> 0; clamp so the box just spans every longitude.
    cos_lat = max(math.cos(math.radians(lat)), 1e-6)
    d_lon = min(radius_m / (METERS_PER_DEGREE_LAT * cos_lat), 180.0)
    return lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon


def places_within(
    db: Session,
    lat: float,
    lon: float,
    radius_m: float,
    category: str | None = None,
    limit: int = 50,
) -> list[tuple[Place, float]]:
    """Places within radius_m of (lat, lon) with their distance in meters, nearest first."""
    south, west, north, east = bounding_box(lat, lon, radius_m)
    query = select(Place).where(Place.lat.between(south, north), Place.lon.between(west, east))
    if category is not None:
        query = query.where(Place.category == category)

    hits = [(place, haversine_m(lat, lon, place.lat, place.lon)) for place in db.scalars(query)]
    hits = [(place, distance) for place, distance in hits if distance <= radius_m]
    hits.sort(key=lambda hit: (hit[1], hit[0].id))
    return hits[:limit]
