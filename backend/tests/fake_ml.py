"""
TEMPORARY stand-ins for app.ml.places / app.ml.interests (Roger's branch).

`install_if_missing` swaps these in only while the real modules are absent, so
once his branch merges the whole suite runs against the real models and this
file (plus the `_ml_fallback` fixture in conftest.py) can be deleted.

They follow the contract in app/ml/types.py but are deliberately simple.
"""

from __future__ import annotations

import importlib.util
import math
from collections import defaultdict
from collections.abc import Collection, Mapping, Sequence

import pytest

from app.ml.types import InterestWeight, PlaceCandidate, ScoredCandidate, VisitFeatures
from app.places import ml
from app.stays import haversine_m

_NONE_SCORE = -2.0
_NON_INTEREST = {"parking", "fuel", "bank", "office", "lodging", "other"}


def fake_rank_candidates(
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


def fake_build_interest_profile(
    visits: Sequence[tuple[VisitFeatures, PlaceCandidate]],
    hidden: Collection[str] = (),
    now_ts: int | None = None,
    half_life_days: float = 60.0,
) -> list[InterestWeight]:
    eligible = [(v, p) for v, p in visits if p.category not in _NON_INTEREST]
    if not eligible:
        return []
    now_ts = now_ts if now_ts is not None else max(v.end_ts for v, _ in eligible)
    score: dict[str, float] = defaultdict(float)
    count: dict[str, int] = defaultdict(int)
    dwell: dict[str, float] = defaultdict(float)
    for v, p in eligible:
        minutes = (v.end_ts - v.start_ts) / 60_000
        age_days = max(0.0, (now_ts - v.end_ts) / 86_400_000)
        score[p.category] += math.sqrt(minutes) * 0.5 ** (age_days / half_life_days)
        count[p.category] += 1
        dwell[p.category] += minutes
    visible_total = sum(s for c, s in score.items() if c not in hidden)
    weights = [
        InterestWeight(
            category=c,
            weight=0.0 if c in hidden or visible_total == 0 else score[c] / visible_total,
            visits=count[c],
            dwell_minutes=dwell[c],
            hidden=c in hidden,
        )
        for c in score
    ]
    weights.sort(key=lambda w: (w.hidden, -w.weight, w.category))
    return weights


def install_if_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    if importlib.util.find_spec("app.ml.places") is None:
        monkeypatch.setattr(ml, "get_ranker", lambda: fake_rank_candidates)
    if importlib.util.find_spec("app.ml.interests") is None:
        monkeypatch.setattr(ml, "get_profile_builder", lambda: fake_build_interest_profile)
