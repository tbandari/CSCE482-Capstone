from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db, make_engine
from app.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A fresh in-memory database and app per test."""
    engine = make_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
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
    engine.dispose()


def register(client: TestClient, email: str = "zayd@tamu.edu", password: str = "correct horse battery") -> dict[str, str]:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return register(client)
