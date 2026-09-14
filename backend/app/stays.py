"""
Server-side port of the on-device pipeline (src/lib/stays in the app):
noise filtering followed by stay-point detection (Li et al., 2008).

Kept parameter-for-parameter identical to the TypeScript implementation so a
visit computed on the phone and one computed here agree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_008.8


@dataclass(frozen=True, slots=True)
class Point:
    ts: int
    lat: float
    lon: float
    accuracy: float | None = None


@dataclass(slots=True)
class Stay:
    start_ts: int
    end_ts: int
    lat: float
    lon: float
    radius: float
    point_count: int


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _valid(p: Point) -> bool:
    return -90 <= p.lat <= 90 and -180 <= p.lon <= 180 and not (p.lat == 0 and p.lon == 0)


def _speed(a: Point, b: Point) -> float:
    dt = (b.ts - a.ts) / 1000
    if dt <= 0:
        return math.inf
    return haversine_m(a.lat, a.lon, b.lat, b.lon) / dt


def filter_points(
    points: list[Point], *, max_accuracy_m: float = 100, max_speed_mps: float = 70
) -> tuple[list[Point], dict[str, int]]:
    """Sort, drop invalid / low-accuracy / duplicate fixes and out-and-back GPS spikes."""
    dropped = {"invalid": 0, "inaccurate": 0, "duplicate": 0, "spike": 0}
    clean: list[Point] = []
    previous: Point | None = None
    for p in sorted(points, key=lambda x: x.ts):
        if not _valid(p):
            dropped["invalid"] += 1
            continue
        if p.accuracy is not None and p.accuracy > max_accuracy_m:
            dropped["inaccurate"] += 1
            continue
        if previous is not None and p.ts == previous.ts:
            dropped["duplicate"] += 1
            continue
        clean.append(p)
        previous = p

    kept: list[Point] = []
    for i, current in enumerate(clean):
        before = kept[-1] if kept else None
        after = clean[i + 1] if i + 1 < len(clean) else None
        if before is not None and after is not None:
            if _speed(before, current) > max_speed_mps or _speed(current, after) > max_speed_mps:
                neighbour_gap = haversine_m(before.lat, before.lon, after.lat, after.lon)
                excursion = haversine_m(before.lat, before.lon, current.lat, current.lon)
                if neighbour_gap < excursion * 0.5:
                    dropped["spike"] += 1
                    continue
        kept.append(current)
    return kept, dropped


def _build_stay(cluster: list[Point]) -> Stay:
    lat = sum(p.lat for p in cluster) / len(cluster)
    lon = sum(p.lon for p in cluster) / len(cluster)
    radius = max(haversine_m(lat, lon, p.lat, p.lon) for p in cluster)
    return Stay(cluster[0].ts, cluster[-1].ts, lat, lon, round(radius), len(cluster))


def _merge(a: Stay, b: Stay) -> Stay:
    total = a.point_count + b.point_count
    lat = (a.lat * a.point_count + b.lat * b.point_count) / total
    lon = (a.lon * a.point_count + b.lon * b.point_count) / total
    separation = haversine_m(a.lat, a.lon, b.lat, b.lon)
    return Stay(a.start_ts, b.end_ts, lat, lon, round(max(a.radius, b.radius) + separation / 2), total)


def detect_stays(
    points: list[Point],
    *,
    distance_threshold_m: float = 100,
    min_duration_ms: int = 10 * 60 * 1000,
    merge_distance_m: float = 75,
    merge_gap_ms: int = 15 * 60 * 1000,
) -> list[Stay]:
    trace = sorted(points, key=lambda p: p.ts)
    stays: list[Stay] = []
    i = 0
    n = len(trace)
    while i < n:
        anchor = trace[i]
        j = i + 1
        while j < n and haversine_m(anchor.lat, anchor.lon, trace[j].lat, trace[j].lon) <= distance_threshold_m:
            j += 1
        if trace[j - 1].ts - anchor.ts >= min_duration_ms:
            stays.append(_build_stay(trace[i:j]))
            i = j
        else:
            i += 1

    merged: list[Stay] = []
    for stay in stays:
        if (
            merged
            and stay.start_ts - merged[-1].end_ts <= merge_gap_ms
            and haversine_m(merged[-1].lat, merged[-1].lon, stay.lat, stay.lon) <= merge_distance_m
        ):
            merged[-1] = _merge(merged[-1], stay)
        else:
            merged.append(stay)
    return merged
