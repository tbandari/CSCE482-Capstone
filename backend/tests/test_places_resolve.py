import pytest
from collections.abc import Callable
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.ml.types import ScoredCandidate
from app.models import Place, Visit
from app.places import ml
from app.places.ml import get_profile_builder as real_get_profile_builder
from app.places.ml import get_ranker as real_get_ranker
from tests.test_visits import HOUR, MINUTE, T0, offset, stationary, travel

EVANS = (30.6160, -96.3393)
NORTHGATE_COFFEE = (30.6222, -96.3465)
EMPTY_FIELD = (30.5950, -96.3000)  # nothing in the sample index within a kilometer


def upload(client: TestClient, auth: dict[str, str], trace: list[dict]) -> None:
    response = client.post("/locations/batch", json={"points": trace}, headers=auth)
    assert response.status_code == 200, response.text


def library_then_field() -> list[dict]:
    """Three hours at Evans Library in the afternoon, then an hour in an empty field."""
    return (
        stationary(EVANS, T0, T0 + 3 * HOUR)
        + travel(EVANS, EMPTY_FIELD, T0 + 3 * HOUR, T0 + 3 * HOUR + 20 * MINUTE)
        + stationary(EMPTY_FIELD, T0 + 3 * HOUR + 20 * MINUTE, T0 + 4 * HOUR + 20 * MINUTE)
    )


def library_coffee_library() -> list[dict]:
    return (
        stationary(EVANS, T0, T0 + 2 * HOUR)
        + travel(EVANS, NORTHGATE_COFFEE, T0 + 2 * HOUR, T0 + 2 * HOUR + 15 * MINUTE)
        + stationary(NORTHGATE_COFFEE, T0 + 2 * HOUR + 15 * MINUTE, T0 + 3 * HOUR)
        + travel(NORTHGATE_COFFEE, EVANS, T0 + 3 * HOUR, T0 + 3 * HOUR + 15 * MINUTE)
        + stationary(EVANS, T0 + 3 * HOUR + 15 * MINUTE, T0 + 5 * HOUR)
    )


class RecordingRanker:
    """Always picks the first candidate with a fixed confidence, and records every call."""

    def __init__(self, confidence: float = 0.9) -> None:
        self.confidence = confidence
        self.calls: list[dict] = []

    def __call__(self, visit, candidates, revisit_counts=None, tz="UTC"):
        self.calls.append(
            {"visit": visit, "candidates": list(candidates), "revisits": dict(revisit_counts or {}), "tz": tz}
        )
        return [ScoredCandidate(c.place_id, 1.0, self.confidence) for c in candidates[:1]]


@pytest.fixture
def ranker(monkeypatch: pytest.MonkeyPatch) -> RecordingRanker:
    recorder = RecordingRanker()
    monkeypatch.setattr(ml, "get_ranker", lambda: recorder)
    return recorder


def test_recompute_resolves_a_library_stay_and_leaves_an_empty_field_alone(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    recompute_job: Callable[[dict[str, str]], dict],
) -> None:
    upload(client, auth, library_then_field())
    result = recompute_job(auth)
    assert result["visits"] == 2
    assert result["resolved"] == 1

    field, library = client.get("/visits", headers=auth).json()  # newest first
    assert library["place"] == {
        "id": places["Evans Library"],
        "name": "Evans Library",
        "category": "library",
        "lat": EVANS[0],
        "lon": EVANS[1],
    }
    assert settings.place_min_confidence <= library["place_confidence"] <= 1
    assert field["place"] is None
    assert field["place_confidence"] is None


def test_resolution_walks_visits_in_order_and_counts_revisits(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    ranker: RecordingRanker,
    recompute_job: Callable[[dict[str, str]], dict],
) -> None:
    upload(client, auth, library_coffee_library())
    assert recompute_job(auth)["resolved"] == 3

    starts = [call["visit"].start_ts for call in ranker.calls]
    assert starts == sorted(starts) and len(starts) == 3
    evans = places["Evans Library"]
    assert ranker.calls[0]["revisits"] == {}
    assert ranker.calls[2]["revisits"] == {evans: 1, places["Northgate Coffee"]: 1}
    assert all(call["tz"] == settings.place_timezone for call in ranker.calls)
    # Candidates come from the index within the search radius, nearest first.
    assert [c.name for c in ranker.calls[0]["candidates"]] == ["Evans Library", "Library Cafe"]


def test_low_confidence_visits_stay_unresolved(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    ranker: RecordingRanker,
    recompute_job: Callable[[dict[str, str]], dict],
) -> None:
    ranker.confidence = settings.place_min_confidence - 0.01
    upload(client, auth, library_coffee_library())
    assert recompute_job(auth)["resolved"] == 0
    assert all(v["place"] is None for v in client.get("/visits", headers=auth).json())


def test_search_radius_limits_candidates(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    ranker: RecordingRanker,
    recompute_job: Callable[[dict[str, str]], dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "place_search_radius_m", 10)
    upload(client, auth, stationary(offset(EVANS, -40, 0), T0, T0 + HOUR))  # 40 m south of Evans
    assert recompute_job(auth)["resolved"] == 0
    assert ranker.calls == []  # no candidates -> the ranker is never asked


def test_recompute_still_detects_visits_without_the_models(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    recompute_job: Callable[[dict[str, str]], dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable():
        raise ml.ModelsUnavailable("not installed")

    monkeypatch.setattr(ml, "get_ranker", unavailable)
    upload(client, auth, library_then_field())
    result = recompute_job(auth)
    assert result["visits"] == 2 and result["resolved"] == 0


def test_a_missing_model_module_is_reported_as_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "app.ml.places":
            raise ModuleNotFoundError(name=name)
        if name == "app.ml.interests":
            raise ModuleNotFoundError("No module named 'numpy'", name="numpy")  # a broken dependency
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    # The real getters, imported before the autouse fallback fixture patched the module.
    with pytest.raises(ml.ModelsUnavailable):
        real_get_ranker()
    with pytest.raises(ModuleNotFoundError):  # not swallowed: a real bug inside the module
        real_get_profile_builder()


def test_deleting_a_place_unassigns_its_visits(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    db: Session,
    recompute_job: Callable[[dict[str, str]], dict],
) -> None:
    upload(client, auth, library_then_field())
    recompute_job(auth)

    db.delete(db.get(Place, places["Evans Library"]))
    db.commit()
    assert db.scalars(select(Visit.place_id)).all() == [None, None]
