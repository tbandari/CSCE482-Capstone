import time

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentUser, DbSession
from app.places import ml
from app.places.profile import resolved_visits, visit_history
from app.schemas import NextPlaceOut, NextPlacesResponse, PlaceSummary

router = APIRouter(prefix="/predict", tags=["predict"])

TOP_K = 3


@router.get("/next", response_model=NextPlacesResponse)
def next_place(
    user: CurrentUser,
    db: DbSession,
    at_ts: int | None = Query(default=None, ge=0, description="Epoch ms; defaults to now"),
) -> NextPlacesResponse:
    """Where this user is likely to go next. Too little history returns no predictions, not an error."""
    try:
        predict_next_place = ml.get_predictor()
    except ml.ModelsUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error

    now_ts = int(time.time() * 1000)
    at = at_ts if at_ts is not None else now_ts
    resolved = resolved_visits(db, user.id)
    predictions = predict_next_place(visit_history(resolved), at, top_k=TOP_K)

    places = {place.id: place for _, place in resolved}
    return NextPlacesResponse(
        generated_at=now_ts,
        at_ts=at,
        predictions=[
            NextPlaceOut(
                place=PlaceSummary.model_validate(places[p.place_id]),
                probability=p.probability,
                rank=p.rank,
            )
            for p in predictions
            if p.place_id in places
        ],
    )
