from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.jobs import handlers
from app.jobs.queue import claim_next, enqueue
from app.models import Job, User
from app.worker import process_one, run_worker
from tests.conftest import register
from tests.test_visits import morning_trace


def user_id(db: Session, email: str = "zayd@tamu.edu") -> int:
    return db.scalar(select(User.id).where(User.email == email))


def test_enqueue_coalesces_and_claim_is_guarded(client, auth, db: Session) -> None:
    first = enqueue(db, "recompute", user_id(db))
    duplicate = enqueue(db, "recompute", user_id(db))
    assert duplicate.id == first.id

    claimed = claim_next(db)
    assert claimed is not None
    assert claimed.id == first.id
    assert claimed.status == "running"
    assert claimed.attempts == 1
    assert claim_next(db) is None


def test_failing_job_records_error_and_stops_after_three_attempts(
    client, auth, db: Session, monkeypatch
) -> None:
    job = enqueue(db, "recompute", user_id(db))

    def fail(_db, _job):
        raise RuntimeError("pipeline broke")

    monkeypatch.setattr(handlers, "run_job", fail)
    for expected_attempt in range(1, 4):
        processed = process_one(db)
        assert processed is not None and processed.id == job.id
        assert processed.attempts == expected_attempt
        assert processed.error == "pipeline broke"
        assert processed.status == ("failed" if expected_attempt == 3 else "queued")
    assert process_one(db) is None


def test_once_processes_only_one_job(client, auth, db: Session) -> None:
    other = register(client, "other@tamu.edu")
    enqueue(db, "recompute", user_id(db))
    enqueue(db, "recompute", user_id(db, "other@tamu.edu"))
    factory = sessionmaker(bind=db.get_bind(), autoflush=False, expire_on_commit=False)

    run_worker(once=True, session_factory=factory)

    assert db.scalar(select(func.count(Job.id)).where(Job.status == "done")) == 1
    assert db.scalar(select(func.count(Job.id)).where(Job.status == "queued")) == 1
    assert other["Authorization"].startswith("Bearer ")


def test_job_status_is_private_and_recompute_finishes(client, auth, db: Session) -> None:
    trace = morning_trace()
    upload = client.post("/locations/batch", json={"points": trace}, headers=auth)
    assert upload.status_code == 200

    queued = client.post("/visits/recompute", headers=auth)
    assert queued.status_code == 202
    assert queued.json()["status"] == "queued"
    job_id = queued.json()["job_id"]

    other = register(client, "other@tamu.edu")
    assert client.get(f"/jobs/{job_id}", headers=other).status_code == 404
    assert client.get(f"/jobs/{job_id}", headers=auth).json()["status"] == "queued"

    processed = process_one(db)
    assert processed is not None and processed.status == "done"
    status = client.get(f"/jobs/{job_id}", headers=auth).json()
    assert status["status"] == "done"
    assert status["result"]["visits"] == 3
    assert len(client.get("/visits", headers=auth).json()) == 3
