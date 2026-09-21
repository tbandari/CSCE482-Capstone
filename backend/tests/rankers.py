"""
A deliberately simple ranker for API tests that must not depend on ranking
quality: nearest place first, softmax confidence against a fixed "none of these"
option. The real ranker (app.ml.places) is exercised in test_places_resolve.py
and measured by the evaluation harness.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from app.ml.types import PlaceCandidate, ScoredCandidate, VisitFeatures
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
