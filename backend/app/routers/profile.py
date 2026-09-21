import time

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession
from app.ml.types import CATEGORIES
from app.models import InterestOverride, Place, User, Visit
from app.places import ml
from app.schemas import InterestOut, InterestPatch, ProfileOut, TopPlaceOut

router = APIRouter(prefix="/profile", tags=["profile"])

TOP_PLACES = 10


def build_profile(db: Session, user: User) -> ProfileOut:
    """The interest profile, computed fresh from the user's resolved visits and their edits."""
    try:
        build_interests = ml.get_profile_builder()
    except ml.ModelsUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The interest model is not installed yet") from error

    hidden = set(
        db.scalars(
            select(InterestOverride.category).where(
                InterestOverride.user_id == user.id, InterestOverride.hidden.is_(True)
            )
        )
    )
    total_visits = db.scalar(select(func.count(Visit.id)).where(Visit.user_id == user.id)) or 0
    resolved = db.execute(
        select(Visit, Place)
        .join(Place, Visit.place_id == Place.id)
        .where(Visit.user_id == user.id)
        .order_by(Visit.start_ts.asc())
    ).all()
    interests = build_interests(
        [(ml.visit_features(visit), ml.place_candidate(place)) for visit, place in resolved], hidden=hidden
    )

    # Hidden categories are hidden everywhere: their places don't show up as favourites either.
    visit_count = func.count(Visit.id).label("visits")
    last_visit = func.max(Visit.end_ts).label("last_visit_ts")
    top_query = (
        select(Place.id, Place.name, Place.category, visit_count, last_visit)
        .join(Visit, Visit.place_id == Place.id)
        .where(Visit.user_id == user.id)
        .group_by(Place.id, Place.name, Place.category)
        .order_by(visit_count.desc(), last_visit.desc(), Place.id)
        .limit(TOP_PLACES)
    )
    if hidden:
        top_query = top_query.where(Place.category.not_in(hidden))

    return ProfileOut(
        generated_at=int(time.time() * 1000),
        total_visits=total_visits,
        resolved_visits=len(resolved),
        interests=[
            InterestOut(
                category=i.category,
                weight=i.weight,
                visits=i.visits,
                dwell_minutes=i.dwell_minutes,
                hidden=i.hidden,
            )
            for i in interests
        ],
        top_places=[
            TopPlaceOut(place_id=row.id, name=row.name, category=row.category, visits=row.visits, last_visit_ts=row.last_visit_ts)
            for row in db.execute(top_query)
        ],
    )


@router.get("", response_model=ProfileOut)
def get_profile(user: CurrentUser, db: DbSession) -> ProfileOut:
    return build_profile(db, user)


@router.patch("/interests/{category}", response_model=ProfileOut)
def update_interest(category: str, body: InterestPatch, user: CurrentUser, db: DbSession) -> ProfileOut:
    """Hide or unhide a category. Unhiding removes the override, so "no row" always means default."""
    if category not in CATEGORIES:
        raise HTTPException(422, f"Unknown category {category!r}")
    override = db.scalar(
        select(InterestOverride).where(InterestOverride.user_id == user.id, InterestOverride.category == category)
    )
    if body.hidden and override is None:
        db.add(InterestOverride(user_id=user.id, category=category, hidden=True))
    elif not body.hidden and override is not None:
        db.execute(delete(InterestOverride).where(InterestOverride.id == override.id))
    db.commit()
    return build_profile(db, user)
