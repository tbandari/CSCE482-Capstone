from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.places import ml
from app.places.recommend import NEVER_RECOMMEND
from tests.conftest import register
from tests.rankers import interest_recommender, nearest_rank_candidates
from tests.test_places_resolve import upload
from tests.test_profile import campus_day

EVANS = (30.6160, -96.3393)


@pytest.fixture(autouse=True)
def models(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin simple models: these tests cover the endpoints, not ranking or scoring quality."""
    monkeypatch.setattr(ml, "get_ranker", lambda: nearest_rank_candidates)
    monkeypatch.setattr(ml, "get_recommender", lambda: interest_recommender)


@pytest.fixture
def day(
    client: TestClient,
    auth: dict[str, str],
    places: dict[str, int],
    recompute_job: Callable[[dict[str, str]], dict],
) -> dict[str, int]:
    upload(client, auth, campus_day())
    result = recompute_job(auth)
    assert (result["visits"], result["resolved"]) == (5, 4)
    return places


def items(response) -> list[dict]:
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_recommendations_shape(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    response = client.get("/recommendations", headers=auth)
    body = response.json()
    assert set(body) == {"generated_at", "items"} and body["generated_at"] > 0
    assert body["items"], "the sample day leaves plenty of unvisited places nearby"
    first = body["items"][0]
    assert set(first) == {"place", "score", "reason"}  # distance_m only from /nearby
    # An unnamed place still carries an explicit null name; the app relies on the key being there.
    assert any(i["place"]["name"] is None for i in body["items"])
    assert set(first["place"]) == {"id", "name", "category", "lat", "lon"}
    assert first["reason"]
    assert [i["score"] for i in body["items"]] == sorted((i["score"] for i in body["items"]), reverse=True)


def test_visited_and_never_recommend_categories_are_excluded(
    client: TestClient, auth: dict[str, str], day: dict[str, int]
) -> None:
    suggested = items(client.get("/recommendations", params={"limit": 50}, headers=auth))
    names = {i["place"]["name"] for i in suggested}
    assert {"Evans Library", "Student Recreation Center", "Northgate Coffee"}.isdisjoint(names)
    assert {i["place"]["category"] for i in suggested}.isdisjoint(NEVER_RECOMMEND)


def test_dismissed_places_stay_gone_and_saved_ones_do_not(
    client: TestClient, auth: dict[str, str], day: dict[str, int]
) -> None:
    before = items(client.get("/recommendations", params={"limit": 50}, headers=auth))
    dismissed, saved = before[0]["place"]["id"], before[1]["place"]["id"]

    assert client.post(f"/recommendations/{dismissed}/feedback", json={"action": "dismissed"}, headers=auth).status_code == 204
    assert client.post(f"/recommendations/{saved}/feedback", json={"action": "saved"}, headers=auth).status_code == 204

    after = {i["place"]["id"] for i in items(client.get("/recommendations", params={"limit": 50}, headers=auth))}
    assert dismissed not in after
    assert saved in after

    # Feedback is an upsert: dismissing what you saved replaces the row.
    assert client.post(f"/recommendations/{saved}/feedback", json={"action": "dismissed"}, headers=auth).status_code == 204
    assert saved not in {i["place"]["id"] for i in items(client.get("/recommendations", params={"limit": 50}, headers=auth))}


def test_hidden_categories_are_never_recommended(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    assert "cafe" in {i["place"]["category"] for i in items(client.get("/recommendations", params={"limit": 50}, headers=auth))}
    assert client.patch("/profile/interests/cafe", json={"hidden": True}, headers=auth).status_code == 200
    assert "cafe" not in {i["place"]["category"] for i in items(client.get("/recommendations", params={"limit": 50}, headers=auth))}


def test_nearby_respects_the_radius_and_reports_distance(
    client: TestClient, auth: dict[str, str], day: dict[str, int]
) -> None:
    params = {"lat": EVANS[0], "lon": EVANS[1], "radius_m": 300, "limit": 50}
    close = items(client.get("/recommendations/nearby", params=params, headers=auth))
    # The unnamed fast-food place is ~255 m away, so it belongs in a 300 m radius too.
    assert [i["place"]["name"] for i in close] == ["Library Cafe", None]
    assert 20 < close[0]["distance_m"] < 30
    assert all(i["distance_m"] <= 300 for i in close)

    wide = items(client.get("/recommendations/nearby", params={**params, "radius_m": 5000}, headers=auth))
    assert {"Kyle Field", "Zachry Engineering Education Complex"} <= {i["place"]["name"] for i in wide}
    assert all(i["distance_m"] <= 5000 for i in wide)


def test_a_user_with_no_resolved_visits_gets_an_empty_list(client: TestClient, places: dict[str, int]) -> None:
    fresh = register(client, "newbie@tamu.edu")
    assert items(client.get("/recommendations", headers=fresh)) == []


def test_validation_and_auth(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    assert client.get("/recommendations").status_code == 401
    assert client.get("/recommendations/nearby", params={"lat": 30.6, "lon": -96.3}).status_code == 401
    assert client.post("/recommendations/1/feedback", json={"action": "saved"}).status_code == 401

    assert client.get("/recommendations", params={"limit": 0}, headers=auth).status_code == 422
    assert client.get("/recommendations", params={"limit": 51}, headers=auth).status_code == 422
    near = {"lat": EVANS[0], "lon": EVANS[1]}
    assert client.get("/recommendations/nearby", params={**near, "radius_m": 0}, headers=auth).status_code == 422
    assert client.get("/recommendations/nearby", params={**near, "radius_m": 20_001}, headers=auth).status_code == 422
    assert client.post(f"/recommendations/{day['Kyle Field']}/feedback", json={"action": "maybe"}, headers=auth).status_code == 422
    assert client.post("/recommendations/999999/feedback", json={"action": "saved"}, headers=auth).status_code == 404


def test_users_are_isolated(client: TestClient, auth: dict[str, str], day: dict[str, int]) -> None:
    mine = items(client.get("/recommendations", params={"limit": 50}, headers=auth))
    other = register(client, "roger@tamu.edu")
    client.post(f"/recommendations/{mine[0]['place']['id']}/feedback", json={"action": "dismissed"}, headers=other)

    assert mine[0]["place"]["id"] in {i["place"]["id"] for i in items(client.get("/recommendations", params={"limit": 50}, headers=auth))}
    assert items(client.get("/recommendations", headers=other)) == []  # they have no history at all


def test_503_without_the_recommender(
    client: TestClient, auth: dict[str, str], day: dict[str, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable():
        raise ml.ModelsUnavailable("app.ml.recommend is not installed yet")

    monkeypatch.setattr(ml, "get_recommender", unavailable)
    assert client.get("/recommendations", headers=auth).status_code == 503
    assert client.get("/recommendations/nearby", params={"lat": EVANS[0], "lon": EVANS[1]}, headers=auth).status_code == 503
