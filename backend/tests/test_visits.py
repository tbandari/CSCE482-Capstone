import math

from fastapi.testclient import TestClient

MINUTE = 60_000
HOUR = 60 * MINUTE
T0 = 1_757_800_000_000

HOME = (30.6079, -96.3217)
COFFEE = (30.6222, -96.3465)
WORK = (30.6212, -96.3403)


def offset(place: tuple[float, float], north_m: float, east_m: float) -> tuple[float, float]:
    lat, lon = place
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def stationary(place, start, end, interval_min=5, jitter_m=10):
    out = []
    k = 0
    ts = start
    while ts <= end:
        sign = 1 if k % 2 == 0 else -1
        lat, lon = offset(place, sign * jitter_m, -sign * jitter_m)
        out.append({"ts": ts, "lat": lat, "lon": lon, "accuracy": 15})
        ts += interval_min * MINUTE
        k += 1
    return out


def travel(a, b, start, end, interval_min=1):
    out = []
    steps = (end - start) // (interval_min * MINUTE)
    for k in range(1, steps):
        f = k / steps
        out.append(
            {
                "ts": start + int(f * (end - start)),
                "lat": a[0] + (b[0] - a[0]) * f,
                "lon": a[1] + (b[1] - a[1]) * f,
                "accuracy": 10,
            }
        )
    return out


def morning_trace():
    return (
        stationary(HOME, T0, T0 + 2 * HOUR)
        + travel(HOME, COFFEE, T0 + 2 * HOUR, T0 + 2 * HOUR + 20 * MINUTE)
        + stationary(COFFEE, T0 + 2 * HOUR + 20 * MINUTE, T0 + 2 * HOUR + 50 * MINUTE)
        + travel(COFFEE, WORK, T0 + 2 * HOUR + 50 * MINUTE, T0 + 3 * HOUR + 10 * MINUTE)
        + stationary(WORK, T0 + 3 * HOUR + 10 * MINUTE, T0 + 6 * HOUR)
    )


def test_recompute_finds_three_visits(client: TestClient, auth: dict[str, str]) -> None:
    trace = morning_trace()
    # Inject a spike and a low-accuracy fix between two regular samples; the filter must drop both.
    trace.append({"ts": T0 + HOUR + 30_000, "lat": 30.7, "lon": -96.3217, "accuracy": 10})
    trace.append({"ts": T0 + HOUR + 40_000, "lat": 30.6079, "lon": -96.3217, "accuracy": 800})

    ingest = client.post("/locations/batch", json={"points": trace}, headers=auth)
    assert ingest.status_code == 200
    assert ingest.json()["inserted"] == len(trace)

    result = client.post("/visits/recompute", headers=auth)
    assert result.status_code == 200
    body = result.json()
    assert body["points"] == len(trace)
    assert body["dropped"]["spike"] == 1
    assert body["dropped"]["inaccurate"] == 1
    assert body["visits"] == 3

    visits = client.get("/visits", headers=auth).json()
    assert len(visits) == 3
    # Newest first.
    assert visits[0]["start_ts"] > visits[1]["start_ts"] > visits[2]["start_ts"]
    work, coffee, home = visits
    assert abs(work["lat"] - WORK[0]) < 0.0005 and abs(work["lon"] - WORK[1]) < 0.0005
    assert coffee["end_ts"] - coffee["start_ts"] >= 25 * MINUTE
    assert home["point_count"] == 25
    assert home["radius"] < 100

    stats = client.get("/locations/stats", headers=auth).json()
    assert stats["visits"] == 3

    # Recomputing is idempotent: visits are replaced, not appended.
    client.post("/visits/recompute", headers=auth)
    assert len(client.get("/visits", headers=auth).json()) == 3


def test_export_contains_everything(client: TestClient, auth: dict[str, str]) -> None:
    trace = morning_trace()
    client.post("/locations/batch", json={"points": trace}, headers=auth)
    client.post("/visits/recompute", headers=auth)

    export = client.get("/export", headers=auth)
    assert export.status_code == 200
    body = export.json()
    assert body["user"]["email"] == "zayd@tamu.edu"
    assert len(body["points"]) == len(trace)
    assert len(body["visits"]) == 3
    assert body["points"][0]["ts"] == T0
    assert body["exported_at"] > 0
