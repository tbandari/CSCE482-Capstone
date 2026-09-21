import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import InterestOverride, Place, Visit
from app.places import ml
from tests.conftest import register
from tests.test_places_resolve import EMPTY_FIELD, EVANS, NORTHGATE_COFFEE, upload
from tests.test_visits import HOUR, MINUTE, T0, stationary, travel

REC_CENTER = (30.6073, -96.3436)


def campus_day() -> list[dict]:
    """Library twice, the gym, a coffee, and an hour somewhere with no place: 5 visits, 4 resolvable."""
    legs = [
        (EVANS, 2 * HOUR),
        (REC_CENTER, 90 * MINUTE),
        (NORTHGATE_COFFEE, 45 * MINUTE),
        (EVANS, 2 * HOUR),
        (EMPTY_FIELD, HOUR),
    ]
    trace: list[dict] = []
    t = T0
    for i, (place, duration) in enumerate(legs):
        trace += stationary(place, t, t + duration)
        t += duration
        if i + 1 < len(legs):
            trace += travel(place, legs[i + 1][0], t, t + 20 * MINUTE)
            t += 20 * MINUTE
    return trace


@pytest.fixture
def day(client: TestClient, auth: dict[str, str], places: dict[str, int]) -> dict[str, int]:
    upload(client, auth, campus_day())
    result = client.post("/visits/recompute", headers=auth).json()
    assert (result["visits"], result["resolved"]) == (5, 4)
    return places


def weights(profile: dict) -> dict[str, float]:
    return {i["category"]: i["weight"] for i in profile["interests"]}


def test_profile_shape_and_weights(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    response = client.get("/profile", headers=auth)
    assert response.status_code == 200
    profile = response.json()
    assert set(profile) == {"generated_at", "total_visits", "resolved_visits", "interests", "top_places"}
    assert profile["generated_at"] > 0
    assert (profile["total_visits"], profile["resolved_visits"]) == (5, 4)

    assert set(weights(profile)) == {"library", "gym", "cafe"}
    assert sum(weights(profile).values()) == pytest.approx(1)
    ordered = [i["weight"] for i in profile["interests"]]
    assert ordered == sorted(ordered, reverse=True)
    library = next(i for i in profile["interests"] if i["category"] == "library")
    assert set(library) == {"category", "weight", "visits", "dwell_minutes", "hidden"}
    assert library["visits"] == 2 and library["hidden"] is False
    assert library["dwell_minutes"] == pytest.approx(240, abs=15)


def test_top_places_are_ranked_by_visit_count(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    top = client.get("/profile", headers=auth).json()["top_places"]
    assert [p["name"] for p in top][0] == "Evans Library"
    assert top[0] == {
        "place_id": day["Evans Library"],
        "name": "Evans Library",
        "category": "library",
        "visits": 2,
        "last_visit_ts": top[0]["last_visit_ts"],
    }
    assert {p["name"] for p in top} == {"Evans Library", "Student Recreation Center", "Northgate Coffee"}
    assert all(p["visits"] == 1 for p in top[1:])
    assert top[0]["last_visit_ts"] > max(p["last_visit_ts"] for p in top[1:])


def test_hiding_a_category_renormalises_the_rest(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    before = weights(client.get("/profile", headers=auth).json())

    hidden = client.patch("/profile/interests/library", json={"hidden": True}, headers=auth)
    assert hidden.status_code == 200
    profile = hidden.json()
    library = profile["interests"][-1]
    assert library["category"] == "library" and library["hidden"] is True and library["weight"] == 0
    visible = {i["category"]: i["weight"] for i in profile["interests"] if not i["hidden"]}
    assert sum(visible.values()) == pytest.approx(1)
    assert visible["gym"] / visible["cafe"] == pytest.approx(before["gym"] / before["cafe"])
    assert "Evans Library" not in [p["name"] for p in profile["top_places"]]
    assert client.get("/profile", headers=auth).json()["interests"] == profile["interests"]

    # Hiding twice is a no-op; unhiding restores the original profile.
    assert client.patch("/profile/interests/library", json={"hidden": True}, headers=auth).status_code == 200
    restored = client.patch("/profile/interests/library", json={"hidden": False}, headers=auth).json()
    assert weights(restored) == pytest.approx(before)
    assert restored["top_places"][0]["name"] == "Evans Library"


def test_patch_validation(client: TestClient, auth: dict[str, str]) -> None:
    assert client.patch("/profile/interests/casino", json={"hidden": True}, headers=auth).status_code == 422
    assert client.patch("/profile/interests/cafe", json={}, headers=auth).status_code == 422
    assert client.patch("/profile/interests/cafe", json={"hidden": "maybe"}, headers=auth).status_code == 422


def test_profile_requires_auth(client: TestClient) -> None:
    assert client.get("/profile").status_code == 401
    assert client.patch("/profile/interests/cafe", json={"hidden": True}).status_code == 401


def test_empty_profile(client: TestClient, auth: dict[str, str]) -> None:
    profile = client.get("/profile", headers=auth).json()
    assert (profile["total_visits"], profile["resolved_visits"]) == (0, 0)
    assert profile["interests"] == [] and profile["top_places"] == []


def test_users_are_isolated(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    other = register(client, "hussam@tamu.edu")
    client.patch("/profile/interests/gym", json={"hidden": True}, headers=other)

    mine = client.get("/profile", headers=auth).json()
    assert not any(i["hidden"] for i in mine["interests"])
    assert mine["total_visits"] == 5
    theirs = client.get("/profile", headers=other).json()
    assert theirs["total_visits"] == 0 and theirs["top_places"] == []


def test_profile_is_503_without_the_interest_model(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable():
        raise ml.ModelsUnavailable("not installed")

    monkeypatch.setattr(ml, "get_profile_builder", unavailable)
    assert client.get("/profile", headers=auth).status_code == 503


def test_export_includes_places_and_overrides(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    client.patch("/profile/interests/cafe", json={"hidden": True}, headers=auth)
    body = client.get("/export", headers=auth).json()
    assert body["interest_overrides"] == [{"category": "cafe", "hidden": True}]
    first, *_, last = body["visits"]  # oldest first
    assert first["place"]["name"] == "Evans Library" and first["place_confidence"] is not None
    assert last["place"] is None


def test_account_delete_removes_overrides_but_not_places(
    client: TestClient, auth: dict[str, str], day: dict[str, int], db: Session
) -> None:
    client.patch("/profile/interests/cafe", json={"hidden": True}, headers=auth)
    assert db.scalar(select(func.count(InterestOverride.id))) == 1

    assert client.delete("/auth/me", headers=auth).status_code == 204
    assert db.scalar(select(func.count(InterestOverride.id))) == 0
    assert db.scalar(select(func.count(Visit.id))) == 0
    assert db.scalar(select(func.count(Place.id))) == 10  # the shared OSM index belongs to nobody
