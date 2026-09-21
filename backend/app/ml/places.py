"""
Ranks OSM place candidates for a detected visit.

Each candidate gets a score that is a weighted sum of log-likelihood-style
features -- distance, how well the visit's duration fits the category's typical
dwell time, whether the place was open, revisit history and a small category
prior -- so the weights below are the knobs to tune, not the shape of the model.
Confidence is a softmax over the candidates' scores plus a fixed-score "none of
these" option, so a lone far-away candidate still reads as low-confidence rather
than the only option winning by default.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.stays import haversine_m

from .opening_hours import status_at
from .types import PlaceCandidate, ScoredCandidate, VisitFeatures

# -- distance --------------------------------------------------------------
W_DISTANCE = 3.0
DISTANCE_SIGMA_M = 15.0  # Gaussian decay scale
DISTANCE_PENALTY_RADIUS_M = 30.0  # the proposal's "30 m rule"
DISTANCE_PENALTY = 2.0  # extra flat penalty once past that radius

# -- dwell fit ---------------------------------------------------------------
W_DWELL = 1.0
# (typical min minutes, typical max minutes); categories not listed are neutral
DWELL_MINUTES_BY_CATEGORY: dict[str, tuple[float, float]] = {
    "cafe": (10, 90),
    "restaurant": (30, 120),
    "fast_food": (5, 45),
    "bar": (30, 180),
    "library": (45, 300),
    "university": (30, 480),
    "school": (30, 480),
    "gym": (40, 120),
    "sports": (30, 180),
    "park": (10, 180),
    "stadium": (120, 300),
    "supermarket": (10, 60),
    "convenience": (2, 20),
    "shop": (5, 60),
    "cinema": (90, 180),
    "theatre": (90, 210),
    "museum": (30, 180),
    "worship": (30, 120),
    "healthcare": (15, 120),
    "pharmacy": (2, 20),
    "bank": (5, 30),
    "fuel": (3, 15),
    "parking": (1, 600),
    "lodging": (300, 1440),
    "office": (30, 600),
}

# -- opening hours -------------------------------------------------------------
W_HOURS = 1.0
HOURS_OPEN_BONUS = 1.0
HOURS_CLOSED_PENALTY = 1.5

# -- revisits ------------------------------------------------------------------
W_REVISIT = 0.5

# -- category prior --------------------------------------------------------
CATEGORY_PRIOR_PENALTY: dict[str, float] = {
    "parking": -1.0,
    "fuel": -1.0,
    "other": -0.5,
}

# -- confidence -----------------------------------------------------------------
NONE_OF_THESE_SCORE = 0.0  # roughly a neutral candidate right at the penalty radius


def _distance_score(dist_m: float) -> float:
    score = -(dist_m**2) / (2 * DISTANCE_SIGMA_M**2)
    if dist_m > DISTANCE_PENALTY_RADIUS_M:
        score -= DISTANCE_PENALTY
    return score


def _dwell_score(category: str, duration_min: float) -> float:
    bounds = DWELL_MINUTES_BY_CATEGORY.get(category)
    if bounds is None:
        return 0.0  # unknown category: neutral
    lo, hi = bounds
    if lo <= duration_min <= hi:
        return 0.0
    width = max(hi - lo, 1.0)
    excess = (lo - duration_min) if duration_min < lo else (duration_min - hi)
    return -((excess / width) ** 2)


def _hours_score(opening_hours: str | None, local_moment: datetime) -> float:
    status = status_at(opening_hours, local_moment)
    if status == "open":
        return HOURS_OPEN_BONUS
    if status == "closed":
        return -HOURS_CLOSED_PENALTY
    return 0.0  # unknown: neutral


def _local_midpoint(visit: VisitFeatures, tz: str) -> datetime:
    midpoint_ts = (visit.start_ts + visit.end_ts) / 2
    utc_moment = datetime.fromtimestamp(midpoint_ts / 1000, tz=timezone.utc)
    try:
        return utc_moment.astimezone(ZoneInfo(tz))
    except Exception:
        return utc_moment


def _score(
    visit: VisitFeatures,
    candidate: PlaceCandidate,
    revisit_counts: Mapping[int, int] | None,
    local_moment: datetime,
) -> tuple[float, float]:
    """Returns (score, distance_m); distance is reused for deterministic tie-breaks."""
    dist_m = haversine_m(visit.lat, visit.lon, candidate.lat, candidate.lon)
    duration_min = (visit.end_ts - visit.start_ts) / 60_000
    revisits = (revisit_counts or {}).get(candidate.place_id, 0)

    score = (
        W_DISTANCE * _distance_score(dist_m)
        + W_DWELL * _dwell_score(candidate.category, duration_min)
        + W_HOURS * _hours_score(candidate.opening_hours, local_moment)
        + W_REVISIT * math.log1p(revisits)
        + CATEGORY_PRIOR_PENALTY.get(candidate.category, 0.0)
    )
    return score, dist_m


def _softmax_with_none_option(scores: Sequence[float]) -> list[float]:
    all_scores = [*scores, NONE_OF_THESE_SCORE]
    peak = max(all_scores)
    exp_scores = [math.exp(s - peak) for s in all_scores]
    total = sum(exp_scores)
    probabilities = [e / total for e in exp_scores]
    return probabilities[:-1]  # drop the "none of these" slot


def rank_candidates(
    visit: VisitFeatures,
    candidates: Sequence[PlaceCandidate],
    revisit_counts: Mapping[int, int] | None = None,
    tz: str = "America/Chicago",
) -> list[ScoredCandidate]:
    """Best first. Returns [] when candidates is empty."""
    if not candidates:
        return []

    local_moment = _local_midpoint(visit, tz)
    scored = [(*_score(visit, c, revisit_counts, local_moment), c.place_id) for c in candidates]
    scored.sort(key=lambda row: (-row[0], row[1], row[2]))

    confidences = _softmax_with_none_option([row[0] for row in scored])
    return [
        ScoredCandidate(place_id=place_id, score=score, confidence=confidence)
        for (score, _dist, place_id), confidence in zip(scored, confidences)
    ]
