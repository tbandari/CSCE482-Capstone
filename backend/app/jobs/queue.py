"""Database backed queue operations with safe single job claiming."""

from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Job, utcnow

SUPPORTED_KINDS = {"recompute"}


def enqueue(db: Session, kind: str, user_id: int) -> Job:
    """Create a queued job, coalescing duplicate recomputes for one user."""
    if kind not in SUPPORTED_KINDS:
        raise ValueError(f"Unsupported job kind {kind!r}")
    if kind == "recompute":
        existing = db.scalar(
            select(Job)
            .where(Job.user_id == user_id, Job.kind == kind, Job.status == "queued")
            .order_by(Job.created_at.asc(), Job.id.asc())
        )
        if existing is not None:
            return existing

    job = Job(id=str(uuid4()), user_id=user_id, kind=kind, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def claim_next(db: Session) -> Job | None:
    """Atomically claim the oldest queued job so competing workers cannot share it."""
    candidate_id = db.scalar(
        select(Job.id).where(Job.status == "queued").order_by(Job.created_at.asc(), Job.id.asc()).limit(1)
    )
    if candidate_id is None:
        return None

    # SQLite uses this guarded UPDATE. Month 3 Postgres workers should select with
    # FOR UPDATE SKIP LOCKED before issuing the same state transition.
    claimed_id = db.scalar(
        update(Job)
        .where(Job.id == candidate_id, Job.status == "queued")
        .values(status="running", started_at=utcnow(), finished_at=None, attempts=Job.attempts + 1)
        .returning(Job.id)
    )
    if claimed_id is None:
        db.rollback()
        return None
    db.commit()
    return db.get(Job, claimed_id)
