import time

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession
from app.models import Place, RecommendationFeedback, User
from app.places import ml
from app.places.profile import interest_weights, resolved_visits, visit_history
from app.places.recommend import recommendation_candidates
from app.schemas import FeedbackRequest, PlaceSummary, RecommendationOut, RecommendationsResponse

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _recommend(
    db: Session,
    user: User,
    limit: int,
    center: tuple[float, float] | None = None,
    radius_m: float | None = None,
    with_distance: bool = False,
) -> RecommendationsResponse:
    try:
        recommend_places = ml.get_recommender()
        resolved = resolved_visits(db, user.id)
        interests = interest_weights(db, user.id, resolved)
    except ml.ModelsUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error

    candidates = recommendation_candidates(db, user.id, center=center, radius_m=radius_m)
    now_ts = int(time.time() * 1000)
    if not candidates:
        return RecommendationsResponse(generated_at=now_ts, items=[])

    by_id = {place.id: (place, distance) for place, distance in candidates}
    scored = recommend_places(
        interests,
        visit_history(resolved),
        [ml.place_candidate(place) for place, _ in candidates],
        now_ts,
        limit=limit,
    )

    items: list[RecommendationOut] = []
    for suggestion in scored[:limit]:
        found = by_id.get(suggestion.place_id)
        if found is None:
            continue  # a model that invents an id is a bug, but it must not 500 the endpoint
        place, distance = found
        items.append(
            RecommendationOut(
                place=PlaceSummary.model_validate(place),
                score=suggestion.score,
                reason=suggestion.reason,
                distance_m=round(distance, 1) if with_distance else None,
            )
        )
    return RecommendationsResponse(generated_at=now_ts, items=items)


@router.get("", response_model=RecommendationsResponse, response_model_exclude_none=True)
def recommendations(user: CurrentUser, db: DbSession, limit: int = Query(default=20, ge=1, le=50)):
    """Places worth trying, ranked against the user's own interest profile."""
    return _recommend(db, user, limit)


@router.get("/nearby", response_model=RecommendationsResponse)
def recommendations_nearby(
    user: CurrentUser,
    db: DbSession,
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    radius_m: float = Query(default=2000, gt=0, le=20000),
    limit: int = Query(default=20, ge=1, le=50),
):
    """The same, around a point: what is worth a detour right now."""
    return _recommend(db, user, limit, center=(lat, lon), radius_m=radius_m, with_distance=True)


@router.post("/{place_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
def feedback(place_id: int, body: FeedbackRequest, user: CurrentUser, db: DbSession) -> Response:
    """Save or dismiss a suggestion. Dismissed places never come back."""
    if db.get(Place, place_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown place")
    existing = db.scalar(
        select(RecommendationFeedback).where(
            RecommendationFeedback.user_id == user.id, RecommendationFeedback.place_id == place_id
        )
    )
    if existing is None:
        db.add(RecommendationFeedback(user_id=user.id, place_id=place_id, action=body.action))
    else:
        existing.action = body.action
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
