"""
Ranks OSM places worth trying next, built entirely from one user's own signals.

Each candidate gets a score that is a weighted sum of interest match, category
variety damping, novelty and current opening-hours status. Deliberately not a
feature: cross-user popularity. We have no cross-user data to compute it from,
and we don't want any -- being different from a "everyone else goes here"
baseline is the point of a personal interest model, and George's evaluation
harness measures exactly that gap against a popularity baseline.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .opening_hours import status_at
from .types import InterestWeight, PlaceCandidate, ScoredPlace, VisitRecord

MS_PER_DAY = 86_400_000

# -- interest match ----------------------------------------------------------
W_INTEREST = 2.0
ABSENT_CATEGORY_INTEREST = 0.05  # near-zero: no profile data for this category at all

# -- category variety ----------------------------------------------------------
W_VARIETY = 1.5
# Damps categories that already dominate the user's history, so a cafés-only
# profile still surfaces a few non-café suggestions instead of just more cafés.
# This deliberately trades hit-rate (matching the strongest interest) for
# discovery; George's harness reports both sides of that tradeoff.

# -- novelty -------------------------------------------------------------------
W_NOVELTY = 0.5
NOVELTY_FULL_DAYS = 90.0  # a category unseen this long (or never seen) gets the max bonus

# -- open now ------------------------------------------------------------------
W_OPEN = 0.5
OPEN_NOW_BONUS = 1.0
CLOSED_NOW_PENALTY = 1.0

CATEGORY_LABELS: dict[str, str] = {
    "cafe": "cafés", "restaurant": "restaurants", "fast_food": "fast food",
    "bar": "bars", "library": "libraries", "university": "campus spots",
    "school": "schools", "gym": "gyms", "sports": "sports venues", "park": "parks",
    "stadium": "stadiums", "supermarket": "grocery stores", "convenience": "convenience stores",
    "shop": "shops", "cinema": "movie theaters", "theatre": "theatres", "museum": "museums",
    "worship": "places of worship", "healthcare": "healthcare spots", "pharmacy": "pharmacies",
    "bank": "banks", "fuel": "gas stations", "parking": "parking", "lodging": "lodging",
    "office": "offices", "other": "places",
}

REASON_TEMPLATES: dict[str, str] = {
    "interest": "matches your interest in {label}",
    "novelty": "you haven't tried {label} in a while",
    "open": "open now, near places you go",
    "default": "worth a look",
}


def _label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category.replace("_", " "))


def _local_time(ts_ms: int, tz: str) -> datetime:
    utc_moment = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    try:
        return utc_moment.astimezone(ZoneInfo(tz))
    except Exception:
        return utc_moment


def _interest_score(category: str, interests_by_category: dict[str, InterestWeight]) -> float:
    weight = interests_by_category.get(category)
    return weight.weight if weight is not None else ABSENT_CATEGORY_INTEREST


def _novelty_score(category: str, last_visit_by_category: dict[str, int], now_ts: int) -> float:
    last_ts = last_visit_by_category.get(category)
    if last_ts is None:
        return 1.0  # never visited this category: fully novel
    age_days = max(now_ts - last_ts, 0) / MS_PER_DAY
    return min(1.0, age_days / NOVELTY_FULL_DAYS)


def _open_score(opening_hours: str | None, local_moment: datetime) -> float:
    status = status_at(opening_hours, local_moment)
    if status == "open":
        return OPEN_NOW_BONUS
    if status == "closed":
        return -CLOSED_NOW_PENALTY
    return 0.0


def _reason(category: str, interest_component: float, novelty_component: float, open_component: float) -> str:
    candidates = [
        ("interest", interest_component),
        ("novelty", novelty_component),
        ("open", open_component),
    ]
    key, value = max(candidates, key=lambda item: item[1])
    if value <= 0:
        return REASON_TEMPLATES["default"]
    return REASON_TEMPLATES[key].format(label=_label(category))


def _normalize(scores: Sequence[float]) -> list[float]:
    if not scores:
        return []
    lo, hi = min(scores), max(scores)
    if hi - lo < 1e-9:
        return [1.0] * len(scores)
    return [(s - lo) / (hi - lo) for s in scores]


def recommend_places(
    interests: Sequence[InterestWeight],
    history: Sequence[VisitRecord],
    candidates: Sequence[PlaceCandidate],
    now_ts: int,
    limit: int = 20,
    tz: str = "America/Chicago",
) -> list[ScoredPlace]:
    """Places worth trying next, best first. Never returns a place already in history."""
    if not candidates or not interests or not history:
        return []

    hidden_categories = {iw.category for iw in interests if iw.hidden}
    visited_place_ids = {v.place_id for v in history}
    eligible = [
        c for c in candidates if c.category not in hidden_categories and c.place_id not in visited_place_ids
    ]
    if not eligible:
        return []

    interests_by_category = {iw.category: iw for iw in interests}
    category_counts = Counter(v.category for v in history)
    total_visits = sum(category_counts.values())
    last_visit_by_category: dict[str, int] = {}
    for v in history:
        last_visit_by_category[v.category] = max(last_visit_by_category.get(v.category, v.end_ts), v.end_ts)
    local_now = _local_time(now_ts, tz)

    scored: list[tuple[float, PlaceCandidate, float, float, float]] = []
    for c in eligible:
        interest = _interest_score(c.category, interests_by_category)
        variety_share = category_counts.get(c.category, 0) / total_visits if total_visits else 0.0
        novelty = _novelty_score(c.category, last_visit_by_category, now_ts)
        open_now = _open_score(c.opening_hours, local_now)

        interest_component = W_INTEREST * interest
        variety_penalty = W_VARIETY * variety_share
        novelty_component = W_NOVELTY * novelty
        open_component = W_OPEN * open_now

        raw = interest_component - variety_penalty + novelty_component + open_component
        scored.append((raw, c, interest_component - variety_penalty, novelty_component, open_component))

    scored.sort(key=lambda row: (-row[0], row[1].place_id))
    top = scored[: max(limit, 0)]

    normalized = _normalize([row[0] for row in top])
    return [
        ScoredPlace(
            place_id=c.place_id,
            score=norm_score,
            reason=_reason(c.category, interest_component, novelty_component, open_component),
        )
        for (raw, c, interest_component, novelty_component, open_component), norm_score in zip(top, normalized)
    ]
