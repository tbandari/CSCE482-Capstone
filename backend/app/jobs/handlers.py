"""Job dispatch and retry state transitions."""

import logging

from sqlalchemy.orm import Session

from app.jobs.recompute import recompute_visits
from app.models import Job, utcnow

MAX_ATTEMPTS = 3
logger = logging.getLogger(__name__)


def run_job(db: Session, job: Job) -> dict:
    if job.kind == "recompute":
        return recompute_visits(db, job.user_id)
    raise ValueError(f"Unsupported job kind {job.kind!r}")


def handle_job(db: Session, job: Job) -> Job:
    """Run one claimed job and persist completion or a bounded retry."""
    job_id = job.id
    try:
        result = run_job(db, job)
        job.result = result
        job.error = None
        job.status = "done"
        job.finished_at = utcnow()
        db.commit()
        logger.info("job %s completed", job.id)
        return job
    except Exception as error:
        db.rollback()
        failed = db.get(Job, job_id)
        if failed is None:  # The owning account may have been deleted while work ran.
            raise
        failed.error = str(error)
        if failed.attempts >= MAX_ATTEMPTS:
            failed.status = "failed"
            failed.finished_at = utcnow()
        else:
            failed.status = "queued"
            failed.started_at = None
            failed.finished_at = None
        db.commit()
        logger.exception("job %s attempt %s failed", failed.id, failed.attempts)
        return failed
