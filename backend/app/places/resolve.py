"""
Assigns each of a user's visits to the OSM place they were most likely at.

Visits are walked in chronological order so the ranker sees how often each
place was chosen *before* the visit being resolved; revisits are one of its
strongest signals. Low-confidence visits stay unresolved rather than guessed.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Visit
from app.places import ml
from app.places.queries import places_within


def resolve_visits(db: Session, user_id: int) -> int:
    """Sets place_id / place_confidence on every visit of the user. Returns how many were resolved.

    Raises ml.ModelsUnavailable before touching anything if the ranker is not installed.
    The caller commits.
    """
    rank = ml.get_ranker()
    visits = db.scalars(select(Visit).where(Visit.user_id == user_id).order_by(Visit.start_ts.asc())).all()

    revisits: Counter[int] = Counter()
    resolved = 0
    for visit in visits:
        visit.place_id = None
        visit.place_confidence = None
        nearby = places_within(db, visit.lat, visit.lon, settings.place_search_radius_m)
        if not nearby:
            continue
        ranking = rank(
            ml.visit_features(visit),
            [ml.place_candidate(place) for place, _ in nearby],
            revisits,
            tz=settings.place_timezone,
        )
        if ranking and ranking[0].confidence >= settings.place_min_confidence:
            best = ranking[0]
            visit.place_id = best.place_id
            visit.place_confidence = best.confidence
            revisits[best.place_id] += 1
            resolved += 1
    db.flush()
    return resolved
