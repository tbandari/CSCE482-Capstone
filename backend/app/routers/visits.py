from fastapi import APIRouter, Query
from sqlalchemy import delete, select

from app.deps import CurrentUser, DbSession
from app.models import LocationPoint, Visit
from app.schemas import RecomputeResponse, VisitOut
from app.stays import Point, detect_stays, filter_points

router = APIRouter(prefix="/visits", tags=["visits"])


@router.get("", response_model=list[VisitOut])
def list_visits(
    user: CurrentUser,
    db: DbSession,
    from_ts: int | None = Query(default=None, ge=0),
    to_ts: int | None = Query(default=None, ge=0),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[Visit]:
    query = select(Visit).where(Visit.user_id == user.id)
    if from_ts is not None:
        query = query.where(Visit.start_ts >= from_ts)
    if to_ts is not None:
        query = query.where(Visit.start_ts <= to_ts)
    return list(db.scalars(query.order_by(Visit.start_ts.desc()).limit(limit)).all())


@router.post("/recompute", response_model=RecomputeResponse)
def recompute(user: CurrentUser, db: DbSession) -> RecomputeResponse:
    """Runs the full pipeline over every stored point and replaces the visits table for this user."""
    rows = db.execute(
        select(LocationPoint.ts, LocationPoint.lat, LocationPoint.lon, LocationPoint.accuracy).where(
            LocationPoint.user_id == user.id
        )
    ).all()
    points = [Point(ts=r.ts, lat=r.lat, lon=r.lon, accuracy=r.accuracy) for r in rows]
    kept, dropped = filter_points(points)
    stays = detect_stays(kept)

    db.execute(delete(Visit).where(Visit.user_id == user.id))
    db.add_all(
        Visit(
            user_id=user.id,
            start_ts=s.start_ts,
            end_ts=s.end_ts,
            lat=s.lat,
            lon=s.lon,
            radius=s.radius,
            point_count=s.point_count,
        )
        for s in stays
    )
    db.commit()
    return RecomputeResponse(points=len(points), kept=len(kept), visits=len(stays), dropped=dropped)
