"""Polling worker for durable Orbit jobs.

Run continuously with ``python -m app.worker`` or process at most one queued job
with ``python -m app.worker --once``.
"""

import argparse
import logging
import signal
import threading

from sqlalchemy.orm import Session, sessionmaker

from app.db import SessionLocal
from app.jobs.handlers import handle_job
from app.jobs.queue import claim_next
from app.models import Job

POLL_SECONDS = 1.0
logger = logging.getLogger(__name__)


def process_one(db: Session) -> Job | None:
    job = claim_next(db)
    if job is None:
        return None
    return handle_job(db, job)


def run_worker(
    *,
    once: bool = False,
    session_factory: sessionmaker = SessionLocal,
    stop_event: threading.Event | None = None,
    poll_seconds: float = POLL_SECONDS,
) -> None:
    stop = stop_event or threading.Event()
    while not stop.is_set():
        with session_factory() as db:
            processed = process_one(db)
        if once:
            return
        if processed is None:
            stop.wait(poll_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process Orbit background jobs")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job and exit")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    stop = threading.Event()

    def request_stop(_signum, _frame) -> None:
        logger.info("worker shutdown requested")
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    run_worker(once=args.once, stop_event=stop)


if __name__ == "__main__":
    main()
