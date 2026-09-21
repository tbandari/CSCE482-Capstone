"""
Turns a list of (visit, resolved place) pairs into a normalized interest profile.

Each visit contributes sqrt(dwell_minutes) -- so a single long visit doesn't
dominate many short ones -- decayed by recency with a half-life, and contributions
are summed per category before normalizing to weights that sum to 1. Categories
that are rarely a real "interest" (parking, a bank stop, the user's own office...)
are dropped entirely rather than shown at a near-zero weight.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Collection, Sequence

from .types import InterestWeight, PlaceCandidate, VisitFeatures

EXCLUDED_CATEGORIES: frozenset[str] = frozenset(
    {"parking", "fuel", "bank", "office", "lodging", "other"}
)

MS_PER_DAY = 86_400_000


def build_interest_profile(
    visits: Sequence[tuple[VisitFeatures, PlaceCandidate]],
    hidden: Collection[str] = (),
    now_ts: int | None = None,
    half_life_days: float = 60.0,
) -> list[InterestWeight]:
    """Sorted by weight desc; hidden categories last with weight 0."""
    eligible = [(v, p) for v, p in visits if p.category not in EXCLUDED_CATEGORIES]
    if not eligible:
        return []
    if now_ts is None:
        now_ts = max(v.end_ts for v, _ in eligible)

    hidden_set = set(hidden)
    decayed_by_category: dict[str, float] = defaultdict(float)
    visits_by_category: dict[str, int] = defaultdict(int)
    dwell_by_category: dict[str, float] = defaultdict(float)

    for visit, place in eligible:
        dwell_minutes = (visit.end_ts - visit.start_ts) / 60_000
        age_days = max(now_ts - visit.end_ts, 0) / MS_PER_DAY
        recency_decay = 0.5 ** (age_days / half_life_days)
        decayed_by_category[place.category] += math.sqrt(max(dwell_minutes, 0.0)) * recency_decay
        visits_by_category[place.category] += 1
        dwell_by_category[place.category] += dwell_minutes

    visible_total = sum(
        weight for category, weight in decayed_by_category.items() if category not in hidden_set
    )

    profile = []
    for category, decayed in decayed_by_category.items():
        is_hidden = category in hidden_set
        weight = 0.0 if is_hidden or visible_total <= 0 else decayed / visible_total
        profile.append(
            InterestWeight(
                category=category,
                weight=weight,
                visits=visits_by_category[category],
                dwell_minutes=dwell_by_category[category],
                hidden=is_hidden,
            )
        )

    profile.sort(key=lambda w: (w.hidden, -w.weight, w.category))
    return profile
