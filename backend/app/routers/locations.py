from fastapi import APIRouter, Query
from sqlalchemy import case, func, select

from app.deps import CurrentUser, DbSession
from app.models import LocationPoint, Visit
from app.schemas import IngestResponse, PointBatch, PointOut, StatsResponse

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("/batch", response_model=IngestResponse)
def ingest(batch: PointBatch, user: CurrentUser, db: DbSession) -> IngestResponse:
    """
    Idempotent ingest. Points already stored for this user (same ts, lat, lon)
    are counted as duplicates, so the phone can safely retry a failed upload.
    """
    incoming = batch.points
    lo = min(p.ts for p in incoming)
    hi = max(p.ts for p in incoming)
    existing = set(
        db.execute(
            select(LocationPoint.ts, LocationPoint.lat, LocationPoint.lon).where(
                LocationPoint.user_id == user.id, LocationPoint.ts >= lo, LocationPoint.ts <= hi
            )
        ).all()
    )
    rows: list[LocationPoint] = []
    seen: set[tuple[int, float, float]] = set()
    for p in incoming:
        key = (p.ts, p.lat, p.lon)
        if key in existing or key in seen:
            continue
        seen.add(key)
        rows.append(LocationPoint(user_id=user.id, **p.model_dump()))
    db.add_all(rows)
    db.commit()
    return IngestResponse(received=len(incoming), inserted=len(rows), duplicates=len(incoming) - len(rows))


@router.get("", response_model=list[PointOut])
def list_points(
    user: CurrentUser,
    db: DbSession,
    from_ts: int | None = Query(default=None, ge=0),
    to_ts: int | None = Query(default=None, ge=0),
    limit: int = Query(default=1000, ge=1, le=10_000),
) -> list[LocationPoint]:
    query = select(LocationPoint).where(LocationPoint.user_id == user.id)
    if from_ts is not None:
        query = query.where(LocationPoint.ts >= from_ts)
    if to_ts is not None:
        query = query.where(LocationPoint.ts <= to_ts)
    return list(db.scalars(query.order_by(LocationPoint.ts.asc()).limit(limit)).all())


@router.get("/stats", response_model=StatsResponse)
def stats(user: CurrentUser, db: DbSession) -> StatsResponse:
    total, device, first, last = db.execute(
        select(
            func.count(LocationPoint.id),
            func.sum(case((LocationPoint.source == "device", 1), else_=0)),
            func.min(LocationPoint.ts),
            func.max(LocationPoint.ts),
        ).where(LocationPoint.user_id == user.id)
    ).one()
    visits = db.scalar(select(func.count(Visit.id)).where(Visit.user_id == user.id)) or 0
    return StatsResponse(
        points=total or 0, device_points=int(device or 0), visits=visits, first_ts=first, last_ts=last
    )
