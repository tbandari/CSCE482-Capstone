import json
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, get_db, make_engine
from app.worker import process_one
from app.main import create_app
from app.places.loader import upsert_places

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def engine() -> Iterator[Engine]:
    """A fresh in-memory database per test."""
    engine = make_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Direct access to the test database, for loading places and checking rows."""
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Iterator:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app = create_app(create_tables=False)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def overpass_sample() -> dict:
    return json.loads((FIXTURES / "overpass-sample.json").read_text())


@pytest.fixture
def places(db: Session, overpass_sample: dict) -> dict[str, int]:
    """Loads the sample OSM extract; returns place ids by name (unnamed places by osm_id)."""
    from app.models import Place

    upsert_places(db, overpass_sample)
    db.commit()
    return {place.name or place.osm_id: place.id for place in db.query(Place).all()}


def register(client: TestClient, email: str = "zayd@tamu.edu", password: str = "correct horse battery") -> dict[str, str]:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return register(client)


@pytest.fixture
def recompute_job(client: TestClient, db: Session) -> Callable[[dict[str, str]], dict]:
    """Queue and synchronously process a recompute so endpoint tests stay deterministic."""

    def run(headers: dict[str, str]) -> dict:
        queued = client.post("/visits/recompute", headers=headers)
        assert queued.status_code == 202, queued.text
        job_id = queued.json()["job_id"]
        processed = process_one(db)
        assert processed is not None and processed.id == job_id and processed.status == "done"
        status = client.get(f"/jobs/{job_id}", headers=headers)
        assert status.status_code == 200, status.text
        assert status.json()["status"] == "done"
        return status.json()["result"]

    return run
