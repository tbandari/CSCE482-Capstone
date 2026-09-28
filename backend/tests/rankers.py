"""
Deliberately simple models for API tests that must not depend on model quality:
a nearest-place ranker, an interest-weight recommender and a frequency
predictor. The real models (app.ml.*) are exercised in test_places_resolve.py
and measured by the evaluation harness; endpoint tests assert on plumbing, not
on scores.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from collections import Counter

from app.ml.types import (
    InterestWeight,
    NextPlace,
    PlaceCandidate,
    ScoredCandidate,
    ScoredPlace,
    VisitFeatures,
    VisitRecord,
)
from app.stays import haversine_m

_NONE_SCORE = -2.0


def nearest_rank_candidates(
    visit: VisitFeatures,
    candidates: Sequence[PlaceCandidate],
    revisit_counts: Mapping[int, int] | None = None,
    tz: str = "America/Chicago",
) -> list[ScoredCandidate]:
    """Nearest first; softmax confidence against a fixed "none of these" option."""
    if not candidates:
        return []
    revisit_counts = revisit_counts or {}
    scored = [
        (-haversine_m(visit.lat, visit.lon, c.lat, c.lon) / 15 + math.log1p(revisit_counts.get(c.place_id, 0)), c)
        for c in candidates
    ]
    total = sum(math.exp(score) for score, _ in scored) + math.exp(_NONE_SCORE)
    scored.sort(key=lambda item: (-item[0], item[1].place_id))
    return [ScoredCandidate(c.place_id, score, math.exp(score) / total) for score, c in scored]


def interest_recommender(
    interests: Sequence[InterestWeight],
    history: Sequence[VisitRecord],
    candidates: Sequence[PlaceCandidate],
    now_ts: int,
    limit: int = 20,
    tz: str = "America/Chicago",
) -> list[ScoredPlace]:
    """Scores a candidate by its category's weight in the profile. Never repeats a visited place."""
    weights = {i.category: i.weight for i in interests if not i.hidden}
    visited = {v.place_id for v in history}
    scored = [
        ScoredPlace(c.place_id, weights.get(c.category, 0.0), f"you like {c.category}")
        for c in candidates
        if c.place_id not in visited
    ]
    scored.sort(key=lambda s: (-s.score, s.place_id))
    return scored[:limit]


def frequency_predictor(
    history: Sequence[VisitRecord],
    at_ts: int,
    top_k: int = 3,
) -> list[NextPlace]:
    """The user's most-visited places, most frequent first."""
    counts = Counter(v.place_id for v in history)
    total = sum(counts.values())
    if total == 0:
        return []
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:top_k]
    return [
        NextPlace(place_id=place_id, probability=count / total, rank=rank)
        for rank, (place_id, count) in enumerate(ranked, start=1)
    ]
