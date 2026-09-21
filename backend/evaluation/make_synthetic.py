"""
Generate the committed synthetic labeled set.

    cd backend && python -m evaluation.make_synthetic

This exists so the harness has something to run against on day 1, in CI, and in
a PR review, without anyone's real location history. It is *not* a substitute
for hand labels: the noise model is Gaussian and the candidate sets are tidy, so
absolute numbers here are optimistic. Its job is to catch regressions and to let
us compare rankers against each other. Real hand labels land per
docs/eval/labeling-protocol.md.

Geography is the Texas A&M places from src/lib/demo/sample-week.ts, so the
synthetic week here and the app's "Load sample week" demo describe the same
campus.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.ml.types import PlaceCandidate, VisitFeatures
from app.stays import haversine_m

from evaluation.labels import LabeledVisit, write_labels

SEED = 482
TARGET_VISITS = 40
NULL_TRUTH_SHARE = 0.10

#: Monday 2026-09-21 00:00 America/Chicago (CDT, UTC-5).
WEEK_START = datetime(2026, 9, 21, 5, 0, tzinfo=timezone.utc)
WEEK_START_TS = int(WEEK_START.timestamp() * 1000)

MINUTE_MS = 60_000
HOUR_MS = 60 * MINUTE_MS
DAY_MS = 24 * HOUR_MS

#: Matches ORBIT_PLACE_SEARCH_RADIUS_M: the candidate set a labeler would see.
SEARCH_RADIUS_M = 50.0
#: GPS centroid error after stay detection has averaged a cluster of fixes.
CENTROID_SIGMA_M = 6.0


def offset_m(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def polar_offset(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    radians = math.radians(bearing_deg)
    return offset_m(lat, lon, distance_m * math.cos(radians), distance_m * math.sin(radians))


class Anchor:
    """A real place plus the distractors that sit close enough to compete with it."""

    def __init__(
        self,
        name: str,
        category: str,
        lat: float,
        lon: float,
        distractors: list[tuple[str, str, float, float]],
        hours: list[tuple[float, float]],
        duration_min: tuple[int, int],
        days: tuple[int, ...],
        weight: float,
        opening_hours: str | None = None,
    ) -> None:
        self.name = name
        self.category = category
        self.lat = lat
        self.lon = lon
        self.distractors = distractors  # (name, category, bearing deg, distance m)
        self.hours = hours  # candidate start windows, hours from local midnight
        self.duration_min = duration_min
        self.days = days  # 0 = Monday
        self.weight = weight
        self.opening_hours = opening_hours


ANCHORS: list[Anchor] = [
    Anchor(
        "Evans Library", "library", 30.6160, -96.3393,
        [("Library Coffee Bar", "cafe", 40, 14), ("Evans Annex", "university", 200, 31),
         ("West Campus Parking", "parking", 285, 44)],
        [(12.0, 15.5), (19.0, 21.5)], (55, 185), (0, 1, 2, 3, 6), 1.5,
        opening_hours="Mo-Th 07:00-24:00; Fr 07:00-20:00; Sa-Su 10:00-22:00",
    ),
    Anchor(
        "Zachry Engineering Complex", "university", 30.6212, -96.3403,
        [("Zachry Cafe", "fast_food", 95, 19), ("Engineering Annex", "university", 250, 38),
         ("Lot 47", "parking", 170, 42)],
        [(8.5, 12.0), (13.0, 16.0)], (60, 200), (0, 1, 2, 3), 1.6,
        opening_hours="Mo-Fr 07:00-22:00",
    ),
    Anchor(
        "Student Rec Center", "gym", 30.6073, -96.3436,
        [("Rec Outdoor Courts", "sports", 130, 33), ("Rec Lot", "parking", 310, 45),
         ("Smoothie counter", "fast_food", 20, 11)],
        [(6.5, 8.0), (17.0, 19.5)], (45, 95), (0, 1, 2, 3, 4), 1.2,
        opening_hours="Mo-Fr 05:30-23:00; Sa-Su 09:00-21:00",
    ),
    Anchor(
        "Kyle Field", "stadium", 30.6101, -96.3402,
        [("Kyle Field Lot 60", "parking", 215, 40), ("Stadium concessions", "fast_food", 70, 24)],
        [(14.0, 17.0)], (140, 260), (5,), 0.5,
    ),
    Anchor(
        "Northgate Coffee", "cafe", 30.6222, -96.3465,
        [("Northgate Tap", "bar", 110, 16), ("Corner Deli", "restaurant", 300, 27),
         ("Northgate Market", "convenience", 195, 36)],
        [(8.0, 10.5), (15.0, 17.0)], (25, 75), (0, 1, 2, 3, 4, 5), 1.4,
        opening_hours="Mo-Fr 06:30-20:00; Sa-Su 07:30-18:00",
    ),
    Anchor(
        "Grocery store", "supermarket", 30.6275, -96.3175,
        [("In-store pharmacy", "pharmacy", 60, 21), ("Grocery Lot", "parking", 240, 43),
         ("Fuel pumps", "fuel", 145, 39)],
        [(17.0, 19.5), (11.0, 13.0)], (20, 50), (1, 3, 5, 6), 0.9,
        opening_hours="Mo-Su 06:00-23:00",
    ),
]

#: Visits that are genuinely not at any candidate: a labeler marks these null.
#: Positioned as an offset from a real place so the ranker is tempted by a
#: plausible neighbour rather than starved of candidates.
NULL_SITES: list[tuple[str, str, float, float, tuple[float, float], tuple[int, int]]] = [
    # (note, near this place, bearing deg, distance m, start window, duration range)
    ("stuck at the George Bush Dr light", "West Campus Parking", 200, 34, (8.0, 9.0), (11, 18)),
    ("friend's apartment, not in OSM", "Northgate Market", 155, 38, (19.0, 22.0), (60, 150)),
    ("bench on Military Walk", "Evans Annex", 25, 30, (12.5, 14.0), (15, 35)),
    ("waiting in the car outside the grocery", "Grocery Lot", 265, 27, (17.0, 18.5), (12, 30)),
]


def _assign_place_ids() -> tuple[dict[str, int], dict[int, tuple[str, str, float, float, str | None]]]:
    """Give every anchor and distractor a stable id, in declaration order."""
    ids: dict[str, int] = {}
    places: dict[int, tuple[str, str, float, float, str | None]] = {}
    next_id = 1

    def register(name: str, category: str, lat: float, lon: float, opening_hours: str | None) -> None:
        nonlocal next_id
        if name in ids:
            return
        ids[name] = next_id
        places[next_id] = (name, category, lat, lon, opening_hours)
        next_id += 1

    for anchor in ANCHORS:
        register(anchor.name, anchor.category, anchor.lat, anchor.lon, anchor.opening_hours)
        for d_name, d_category, bearing, distance in anchor.distractors:
            d_lat, d_lon = polar_offset(anchor.lat, anchor.lon, bearing, distance)
            register(d_name, d_category, d_lat, d_lon, None)
    return ids, places


PLACE_IDS, PLACES = _assign_place_ids()


def _candidate(place_id: int) -> PlaceCandidate:
    name, category, lat, lon, opening_hours = PLACES[place_id]
    return PlaceCandidate(
        place_id=place_id, name=name, category=category, lat=lat, lon=lon, opening_hours=opening_hours
    )


def _noisy_centroid(rng: random.Random, lat: float, lon: float, limit_m: float) -> tuple[float, float]:
    """Gaussian centroid error, resampled if it would push the truth out of the search radius."""
    for _ in range(50):
        north = rng.gauss(0, CENTROID_SIGMA_M)
        east = rng.gauss(0, CENTROID_SIGMA_M)
        if math.hypot(north, east) <= limit_m:
            return offset_m(lat, lon, north, east)
    return lat, lon


def _start_ts(rng: random.Random, day: int, window: tuple[float, float]) -> int:
    start_hour = rng.uniform(*window)
    return WEEK_START_TS + day * DAY_MS + int(start_hour * HOUR_MS)


def _nearby_candidates(lat: float, lon: float, always: int | None = None) -> list[PlaceCandidate]:
    """
    What /places/nearby would have returned: every known place inside the search
    radius. `always` forces the truth in even if centroid noise pushed it out,
    because a labeler looking at the map would still have seen it.
    """
    chosen = []
    for place_id in PLACES:
        candidate = _candidate(place_id)
        within = haversine_m(lat, lon, candidate.lat, candidate.lon) <= SEARCH_RADIUS_M
        if within or place_id == always:
            chosen.append(candidate)
    return sorted(chosen, key=lambda c: c.place_id)


def generate(seed: int = SEED, n: int = TARGET_VISITS) -> list[LabeledVisit]:
    """Build the labeled set. Same seed, same bytes, always."""
    rng = random.Random(seed)
    n_null = max(1, round(n * NULL_TRUTH_SHARE))
    n_real = n - n_null

    weights = [a.weight for a in ANCHORS]
    labels: list[LabeledVisit] = []

    for i in range(n_real):
        anchor = rng.choices(ANCHORS, weights=weights, k=1)[0]
        day = rng.choice(anchor.days)
        window = rng.choice(anchor.hours)
        start_ts = _start_ts(rng, day, window)
        duration = rng.randint(*anchor.duration_min) * MINUTE_MS
        lat, lon = _noisy_centroid(rng, anchor.lat, anchor.lon, SEARCH_RADIUS_M * 0.6)
        radius = round(rng.uniform(8, 34), 1)

        truth_id = PLACE_IDS[anchor.name]
        candidates = _nearby_candidates(lat, lon, always=truth_id)

        labels.append(
            LabeledVisit(
                id=f"syn-{i + 1:04d}",
                visit=VisitFeatures(
                    start_ts=start_ts, end_ts=start_ts + duration, lat=lat, lon=lon, radius=radius
                ),
                candidates=tuple(candidates),
                truth_place_id=truth_id,
                labeler="synthetic",
                notes="",
            )
        )

    for j in range(n_null):
        note, near_name, bearing, distance, window, duration_range = NULL_SITES[j % len(NULL_SITES)]
        _, _, near_lat, near_lon, _ = PLACES[PLACE_IDS[near_name]]
        site_lat, site_lon = polar_offset(near_lat, near_lon, bearing, distance)
        day = rng.randrange(7)
        start_ts = _start_ts(rng, day, window)
        duration = rng.randint(*duration_range) * MINUTE_MS
        lat, lon = _noisy_centroid(rng, site_lat, site_lon, SEARCH_RADIUS_M * 0.6)
        radius = round(rng.uniform(10, 40), 1)

        labels.append(
            LabeledVisit(
                id=f"syn-null-{j + 1:04d}",
                visit=VisitFeatures(
                    start_ts=start_ts, end_ts=start_ts + duration, lat=lat, lon=lon, radius=radius
                ),
                candidates=tuple(_nearby_candidates(lat, lon)),
                truth_place_id=None,
                labeler="synthetic",
                notes=note,
            )
        )

    labels.sort(key=lambda label: (label.visit.start_ts, label.id))
    return labels


DEFAULT_PATH = Path(__file__).parent / "data" / "synthetic-places.jsonl"

HEADER = (
    "SYNTHETIC DATA -- NOT REAL LOCATION HISTORY, NOT HAND LABELS.",
    "",
    f"Generated by `python -m evaluation.make_synthetic` (seed {SEED}). Do not edit by hand:",
    "re-run the generator instead, or the file and the script drift apart.",
    "",
    "Places are the Texas A&M locations from src/lib/demo/sample-week.ts, with distractors",
    "10-45 m away. Centroid noise is Gaussian; real GPS error is heavier-tailed and",
    "correlated, so scores here are optimistic. Use it for regression and for comparing",
    "rankers to each other, never as evidence of real-world accuracy.",
    "",
    "Real hand labels live in evaluation/data/real/ and are gitignored:",
    "see docs/eval/labeling-protocol.md.",
)


def main() -> None:
    labels = generate()
    write_labels(DEFAULT_PATH, labels, HEADER)
    with_truth = sum(1 for label in labels if label.has_truth)
    print(
        f"wrote {len(labels)} labels to {DEFAULT_PATH.relative_to(Path.cwd())} "
        f"({with_truth} with a place, {len(labels) - with_truth} null-truth)"
    )


if __name__ == "__main__":
    main()
