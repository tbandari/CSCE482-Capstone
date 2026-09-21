from fastapi.testclient import TestClient

from app.places.queries import bounding_box
from app.stays import haversine_m

EVANS = (30.6160, -96.3393)


def test_bounding_box_contains_the_radius() -> None:
    south, west, north, east = bounding_box(*EVANS, 500)
    assert haversine_m(EVANS[0], EVANS[1], north, EVANS[1]) >= 499
    assert haversine_m(EVANS[0], EVANS[1], EVANS[0], east) >= 499
    assert south < EVANS[0] < north and west < EVANS[1] < east
    # Near a pole the box degrades to every longitude instead of dividing by ~0.
    _, west, _, east = bounding_box(89.9999, 0.0, 5000)
    assert east - west <= 360


def test_nearby_is_sorted_and_respects_the_radius(
    client: TestClient, auth: dict[str, str], places: dict[str, int]
) -> None:
    response = client.get("/places/nearby", params={"lat": EVANS[0], "lon": EVANS[1], "radius_m": 300}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    names = [p["name"] for p in body]
    assert names[:2] == ["Evans Library", "Library Cafe"]
    assert body[0]["distance_m"] == 0
    assert 20 < body[1]["distance_m"] < 30
    assert [p["distance_m"] for p in body] == sorted(p["distance_m"] for p in body)
    assert all(p["distance_m"] <= 300 for p in body)
    assert "Kyle Field" not in names  # ~660 m away
    assert set(body[0]) == {"id", "osm_id", "name", "category", "lat", "lon", "distance_m"}

    wide = client.get("/places/nearby", params={"lat": EVANS[0], "lon": EVANS[1], "radius_m": 1000}, headers=auth)
    assert "Kyle Field" in [p["name"] for p in wide.json()]


def test_nearby_category_filter_and_limit(client: TestClient, auth: dict[str, str], places: dict[str, int]) -> None:
    cafes = client.get(
        "/places/nearby", params={"lat": EVANS[0], "lon": EVANS[1], "radius_m": 5000, "category": "cafe"}, headers=auth
    ).json()
    assert [p["name"] for p in cafes] == ["Library Cafe", "Northgate Coffee"]

    one = client.get("/places/nearby", params={"lat": EVANS[0], "lon": EVANS[1], "radius_m": 5000, "limit": 1}, headers=auth)
    assert [p["name"] for p in one.json()] == ["Evans Library"]


def test_nearby_validation_and_auth(client: TestClient, auth: dict[str, str], places: dict[str, int]) -> None:
    params = {"lat": EVANS[0], "lon": EVANS[1]}
    assert client.get("/places/nearby", params=params).status_code == 401
    assert client.get("/places/nearby", params={**params, "category": "casino"}, headers=auth).status_code == 422
    assert client.get("/places/nearby", params={**params, "radius_m": 50_000}, headers=auth).status_code == 422
    assert client.get("/places/nearby", params={"lat": 95, "lon": 0}, headers=auth).status_code == 422
    empty = client.get("/places/nearby", params={"lat": 0.5, "lon": 0.5}, headers=auth)
    assert empty.status_code == 200 and empty.json() == []
