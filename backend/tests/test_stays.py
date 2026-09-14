"""Unit tests for the Python port of the stay pipeline; mirrors src/lib/stays/__tests__ in the app."""

import math

from app.stays import Point, detect_stays, filter_points, haversine_m

MINUTE = 60_000
HOUR = 60 * MINUTE
HOME = (30.6079, -96.3217)
FAR = (30.6512, -96.3217)  # ~4.8 km north


def offset(place, north_m, east_m):
    lat, lon = place
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def stationary(place, start, end, interval_min=5, jitter_m=10):
    points = []
    ts = start
    k = 0
    while ts <= end:
        sign = 1 if k % 2 == 0 else -1
        lat, lon = offset(place, sign * jitter_m, -sign * jitter_m)
        points.append(Point(ts, lat, lon, 15))
        ts += interval_min * MINUTE
        k += 1
    return points


def test_haversine_one_degree_at_equator():
    assert abs(haversine_m(0, 0, 0, 1) - 111_195) < 50


def test_filter_drops_inaccurate_duplicates_and_spikes():
    points = [
        Point(0, *HOME, 15),
        Point(60_000, *HOME, 250),  # inaccurate
        Point(60_000, *HOME, 15),  # duplicate ts of the previous row (sorted after drop)
        Point(120_000, *FAR, 15),  # spike: 4.8 km in 60 s and straight back
        Point(180_000, *HOME, 15),
        Point(240_000, 0, 0, 15),  # null island
    ]
    kept, dropped = filter_points(points)
    assert dropped == {"invalid": 1, "inaccurate": 1, "duplicate": 0, "spike": 1}
    assert [p.ts for p in kept] == [0, 60_000, 180_000]


def test_filter_keeps_a_real_relocation():
    points = [Point(0, *HOME, 15), Point(60_000, *FAR, 15), Point(120_000, *FAR, 15), Point(180_000, *FAR, 15)]
    kept, dropped = filter_points(points)
    assert len(kept) == 4 and dropped["spike"] == 0


def test_detect_three_stays_and_ignore_short_stop():
    coffee = (30.6222, -96.3465)
    work = (30.6212, -96.3403)
    t0 = 1_757_800_000_000
    trace = (
        stationary(HOME, t0, t0 + 2 * HOUR)
        + stationary(coffee, t0 + 2 * HOUR + 20 * MINUTE, t0 + 2 * HOUR + 50 * MINUTE)
        + stationary(work, t0 + 3 * HOUR + 10 * MINUTE, t0 + 6 * HOUR)
        + stationary(FAR, t0 + 6 * HOUR + 30 * MINUTE, t0 + 6 * HOUR + 35 * MINUTE, interval_min=1)
    )
    stays = detect_stays(trace)
    assert len(stays) == 3
    assert haversine_m(stays[0].lat, stays[0].lon, *HOME) < 20
    assert stays[1].end_ts - stays[1].start_ts >= 25 * MINUTE
    assert stays[2].start_ts > stays[1].end_ts


def test_merge_after_single_gps_jump():
    t0 = 1_757_800_000_000
    first = stationary(HOME, t0, t0 + 30 * MINUTE)
    jump = Point(t0 + 31 * MINUTE, *offset(HOME, 150, 0), 15)
    second = stationary(HOME, t0 + 32 * MINUTE, t0 + 62 * MINUTE)
    stays = detect_stays(first + [jump] + second)
    assert len(stays) == 1
    assert stays[0].point_count == len(first) + len(second)
    assert stays[0].start_ts == t0 and stays[0].end_ts == t0 + 62 * MINUTE
