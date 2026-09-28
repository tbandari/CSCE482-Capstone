import pytest
from fastapi.testclient import TestClient

from app.places import ml
from tests.conftest import register
from tests.rankers import frequency_predictor, nearest_rank_candidates
from tests.test_places_resolve import upload
from tests.test_profile import campus_day

T0 = 1_757_800_000_000


@pytest.fixture(autouse=True)
def models(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin a simple predictor: these tests cover the endpoint, not prediction quality."""
    monkeypatch.setattr(ml, "get_ranker", lambda: nearest_rank_candidates)
    monkeypatch.setattr(ml, "get_predictor", lambda: frequency_predictor)


@pytest.fixture
def day(client: TestClient, auth: dict[str, str], places: dict[str, int]) -> dict[str, int]:
    upload(client, auth, campus_day())
    assert client.post("/visits/recompute", headers=auth).json()["resolved"] == 4
    return places


def test_next_place_shape(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    response = client.get("/predict/next", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"generated_at", "at_ts", "predictions"}
    assert body["generated_at"] > 0 and body["at_ts"] > 0

    predictions = body["predictions"]
    assert 0 < len(predictions) <= 3
    assert [p["rank"] for p in predictions] == list(range(1, len(predictions) + 1))
    assert [p["probability"] for p in predictions] == sorted((p["probability"] for p in predictions), reverse=True)
    assert sum(p["probability"] for p in predictions) <= 1 + 1e-9
    assert set(predictions[0]["place"]) == {"id", "name", "category", "lat", "lon"}
    # The library is the only place visited twice in the sample day.
    assert predictions[0]["place"]["name"] == "Evans Library"


def test_at_ts_is_echoed_and_defaults_to_now(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    asked = T0 + 86_400_000
    assert client.get("/predict/next", params={"at_ts": asked}, headers=auth).json()["at_ts"] == asked
    body = client.get("/predict/next", headers=auth).json()
    assert abs(body["at_ts"] - body["generated_at"]) < 1000


def test_short_history_returns_no_predictions(client: TestClient, places: dict[str, int]) -> None:
    fresh = register(client, "quiet@tamu.edu")
    response = client.get("/predict/next", headers=fresh)
    assert response.status_code == 200
    assert response.json()["predictions"] == []


def test_validation_and_auth(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    assert client.get("/predict/next").status_code == 401
    assert client.get("/predict/next", params={"at_ts": -1}, headers=auth).status_code == 422
    assert client.get("/predict/next", params={"at_ts": "soon"}, headers=auth).status_code == 422


def test_503_without_the_predictor(
    client: TestClient, auth: dict[str, str], day: dict[str, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable():
        raise ml.ModelsUnavailable("app.ml.predict is not installed yet")

    monkeypatch.setattr(ml, "get_predictor", unavailable)
    assert client.get("/predict/next", headers=auth).status_code == 503


def test_users_are_isolated(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    other = register(client, "hussam@tamu.edu")
    assert client.get("/predict/next", headers=other).json()["predictions"] == []
    assert client.get("/predict/next", headers=auth).json()["predictions"]
