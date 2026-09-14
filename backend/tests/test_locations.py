from fastapi.testclient import TestClient

from tests.conftest import register

T0 = 1_757_800_000_000  # 2025-09-13T21:33:20Z


def point(i: int, **overrides):
    base = {"ts": T0 + i * 60_000, "lat": 30.6079 + i * 1e-5, "lon": -96.3217, "accuracy": 12.0}
    base.update(overrides)
    return base


def test_ingest_is_idempotent(client: TestClient, auth: dict[str, str]) -> None:
    batch = {"points": [point(i) for i in range(5)]}
    first = client.post("/locations/batch", json=batch, headers=auth)
    assert first.status_code == 200
    assert first.json() == {"received": 5, "inserted": 5, "duplicates": 0}

    again = client.post("/locations/batch", json=batch, headers=auth)
    assert again.json() == {"received": 5, "inserted": 0, "duplicates": 5}

    mixed = {"points": [point(4), point(5), point(5)]}  # one old, one new, one in-batch duplicate
    assert client.post("/locations/batch", json=mixed, headers=auth).json() == {
        "received": 3,
        "inserted": 1,
        "duplicates": 2,
    }


def test_ingest_validates_coordinates_and_batch_size(client: TestClient, auth: dict[str, str]) -> None:
    bad = client.post("/locations/batch", json={"points": [point(0, lat=999)]}, headers=auth)
    assert bad.status_code == 422
    empty = client.post("/locations/batch", json={"points": []}, headers=auth)
    assert empty.status_code == 422


def test_list_points_by_range(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/locations/batch", json={"points": [point(i) for i in range(10)]}, headers=auth)
    response = client.get("/locations", params={"from_ts": T0 + 2 * 60_000, "to_ts": T0 + 5 * 60_000}, headers=auth)
    assert response.status_code == 200
    rows = response.json()
    assert [r["ts"] for r in rows] == [T0 + i * 60_000 for i in range(2, 6)]
    assert rows[0]["id"] > 0

    limited = client.get("/locations", params={"limit": 3}, headers=auth).json()
    assert len(limited) == 3


def test_stats(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/locations/stats", headers=auth).json() == {
        "points": 0,
        "device_points": 0,
        "visits": 0,
        "first_ts": None,
        "last_ts": None,
    }
    client.post(
        "/locations/batch",
        json={"points": [point(0), point(1, source="import", import_id="imp-1"), point(2)]},
        headers=auth,
    )
    stats = client.get("/locations/stats", headers=auth).json()
    assert stats["points"] == 3
    assert stats["device_points"] == 2
    assert stats["first_ts"] == T0
    assert stats["last_ts"] == T0 + 2 * 60_000


def test_users_are_isolated(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/locations/batch", json={"points": [point(i) for i in range(3)]}, headers=auth)
    other = register(client, "tanish@tamu.edu")
    assert client.get("/locations", headers=other).json() == []
    assert client.get("/locations/stats", headers=other).json()["points"] == 0
