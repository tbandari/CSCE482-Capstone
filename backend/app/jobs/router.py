"""Authenticated job status endpoint."""

from fastapi import APIRouter, HTTPException

from app.deps import CurrentUser, DbSession
from app.jobs.schemas import JobOut
from app.models import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, user: CurrentUser, db: DbSession) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(404, "Job not found")
    return job
