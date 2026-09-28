from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.jobs.queue import enqueue
from app.jobs.schemas import EnqueuedJobOut
from app.models import Visit
from app.schemas import VisitOut

router = APIRouter(prefix="/visits", tags=["visits"])


@router.get("", response_model=list[VisitOut])
def list_visits(
    user: CurrentUser,
    db: DbSession,
    from_ts: int | None = Query(default=None, ge=0),
    to_ts: int | None = Query(default=None, ge=0),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[Visit]:
    query = select(Visit).where(Visit.user_id == user.id).options(selectinload(Visit.place))
    if from_ts is not None:
        query = query.where(Visit.start_ts >= from_ts)
    if to_ts is not None:
        query = query.where(Visit.start_ts <= to_ts)
    return list(db.scalars(query.order_by(Visit.start_ts.desc()).limit(limit)).all())


@router.post("/recompute", response_model=EnqueuedJobOut, status_code=status.HTTP_202_ACCEPTED)
def recompute(user: CurrentUser, db: DbSession) -> EnqueuedJobOut:
    """Queue the expensive recompute pipeline and return without blocking the request."""
    job = enqueue(db, "recompute", user.id)
    return EnqueuedJobOut(job_id=job.id, status="queued")
