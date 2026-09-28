"""
The pieces of a user's interest profile that more than one endpoint needs.

`/profile` renders these for the user; `/recommendations` feeds the same weights
and history into the recommender, so they have to come from one place: a category
the user hid must disappear from both.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ml.types import InterestWeight, VisitRecord
from app.models import InterestOverride, Place, Visit
from app.places import ml


def hidden_categories(db: Session, user_id: int) -> set[str]:
    return set(
        db.scalars(
            select(InterestOverride.category).where(
                InterestOverride.user_id == user_id, InterestOverride.hidden.is_(True)
            )
        )
    )


def resolved_visits(db: Session, user_id: int) -> list[tuple[Visit, Place]]:
    """The user's visits that have a place, oldest first."""
    return list(
        db.execute(
            select(Visit, Place)
            .join(Place, Visit.place_id == Place.id)
            .where(Visit.user_id == user_id)
            .order_by(Visit.start_ts.asc())
        ).all()
    )


def interest_weights(
    db: Session, user_id: int, resolved: list[tuple[Visit, Place]] | None = None
) -> list[InterestWeight]:
    """Raises ml.ModelsUnavailable when the interest model is not installed."""
    build_interests = ml.get_profile_builder()
    if resolved is None:
        resolved = resolved_visits(db, user_id)
    return build_interests(
        [(ml.visit_features(visit), ml.place_candidate(place)) for visit, place in resolved],
        hidden=hidden_categories(db, user_id),
    )


def visit_history(resolved: list[tuple[Visit, Place]]) -> list[VisitRecord]:
    return [ml.visit_record(visit, place) for visit, place in resolved]
