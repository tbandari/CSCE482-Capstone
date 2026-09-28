"""Public job response shapes."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class EnqueuedJobOut(BaseModel):
    job_id: str
    status: Literal["queued"]


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    status: Literal["queued", "running", "done", "failed"]
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    result: dict | None
    error: str | None
    attempts: int
