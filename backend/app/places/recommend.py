"""
Which places are even eligible to be recommended.

Everything the user has already visited or dismissed is out, as are categories
they hid and the ones nobody wants suggested (a parking lot is where you park,
not somewhere to try). The model ranks what survives; it never has to know about
feedback or overrides.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Place, RecommendationFeedback, Visit
from app.places.profile import hidden_categories
from app.places.queries import places_within

# Categories that are a means to an end, never a suggestion.
NEVER_RECOMMEND = frozenset({"parking", "fuel", "bank", "office", "lodging", "other"})


def visit_centroid(db: Session, user_id: int) -> tuple[float, float] | None:
    """The middle of the user's resolved visits, or None when they have none."""
    lat, lon = db.execute(
        select(func.avg(Visit.lat), func.avg(Visit.lon)).where(
            Visit.user_id == user_id, Visit.place_id.is_not(None)
        )
    ).one()
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def recommendation_candidates(
    db: Session,
    user_id: int,
    center: tuple[float, float] | None = None,
    radius_m: float | None = None,
    limit: int | None = None,
) -> list[tuple[Place, float]]:
    """Eligible places with their distance from `center`, nearest first.

    Without an explicit centre, searches around the middle of the user's own
    visits; a user with no resolved visits gets nothing, because we have no idea
    where they are and won't guess.
    """
    limit = limit or settings.recommend_max_candidates
    if center is None:
        center = visit_centroid(db, user_id)
        if center is None:
            return []
        radius_m = radius_m if radius_m is not None else settings.recommend_home_radius_m
    if radius_m is None:
        radius_m = settings.recommend_home_radius_m

    excluded_categories = hidden_categories(db, user_id) | NEVER_RECOMMEND
    visited = set(
        db.scalars(select(Visit.place_id).where(Visit.user_id == user_id, Visit.place_id.is_not(None)))
    )
    dismissed = set(
        db.scalars(
            select(RecommendationFeedback.place_id).where(
                RecommendationFeedback.user_id == user_id,
                RecommendationFeedback.action == "dismissed",
            )
        )
    )

    # Ask for more than we need, because the filtering below happens in Python.
    # PostGIS moves both the radius and the exclusions into SQL in month 3.
    nearby = places_within(db, center[0], center[1], radius_m, limit=limit * 3)
    eligible = [
        (place, distance)
        for place, distance in nearby
        if place.id not in visited and place.id not in dismissed and place.category not in excluded_categories
    ]
    return eligible[:limit]
