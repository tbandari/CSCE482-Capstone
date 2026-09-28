"""
Predicts the user's next few places from their own visit history alone.

Three simple, explainable signals are blended -- no training step, no PyTorch:
a first-order Markov chain over consecutive places (what usually follows the
place the user is at now), a time-of-day/day-of-week habit match, and an
exponentially-decayed recency/frequency count. Each signal is normalized to a
probability distribution over the places seen in `history` before blending, and
the blend keeps a reserved slice of probability mass unclaimed, standing in for
"somewhere not in the history at all."

Limits worth stating up front: there is no travel-time model and no calendar
awareness, so a first visit to a new city, or the first stop of a trip, is out
of scope -- the model only knows what this user has done before, at these
places, at roughly these times.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .types import NextPlace, VisitRecord

MS_PER_DAY = 86_400_000

# predict_next_place has no tz parameter (fixed contract), so local time uses
# the same default the rest of the backend uses for opening hours.
TZ = "America/Chicago"

MIN_HISTORY_VISITS = 5

# -- blend weights -- sum to 1.0; the remainder is reserved for "somewhere new" --
W_TRANSITION = 0.5
W_TIME = 0.3
W_RECENCY = 0.2
NEW_PLACE_MASS = 0.15  # probability held back, unassigned to any known place

HALF_LIFE_DAYS_DEFAULT = 30.0
HOUR_BUCKET_SIZE = 2  # two-hour buckets, per the spec


def _local_time(ts_ms: int, tz: str) -> datetime:
    utc_moment = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    try:
        return utc_moment.astimezone(ZoneInfo(tz))
    except Exception:
        return utc_moment


def _time_bucket(moment: datetime) -> tuple[int, bool]:
    return moment.hour // HOUR_BUCKET_SIZE, moment.weekday() >= 5  # (2h bucket, is_weekend)


def _transition_probs(history: Sequence[VisitRecord], distinct_places: list[int]) -> dict[int, float]:
    """Laplace-smoothed P(next place | most recent place); sums to 1 over distinct_places."""
    n_vocab = len(distinct_places)
    last_place = history[-1].place_id
    transitions: Counter[int] = Counter()
    for prev, curr in zip(history, history[1:]):
        if prev.place_id == last_place:
            transitions[curr.place_id] += 1
    total = sum(transitions.values())
    denom = total + n_vocab
    return {place_id: (transitions.get(place_id, 0) + 1) / denom for place_id in distinct_places}


def _time_of_day_probs(history: Sequence[VisitRecord], distinct_places: list[int], at_ts: int) -> dict[int, float]:
    """Fraction of the same-bucket visits (weekday/weekend x 2h slot as `at_ts`) that went to each place."""
    at_bucket = _time_bucket(_local_time(at_ts, TZ))
    matching: Counter[int] = Counter()
    for v in history:
        if _time_bucket(_local_time(v.start_ts, TZ)) == at_bucket:
            matching[v.place_id] += 1
    total = sum(matching.values())
    if total == 0:
        return dict.fromkeys(distinct_places, 0.0)
    return {place_id: matching.get(place_id, 0) / total for place_id in distinct_places}


def _recency_probs(
    history: Sequence[VisitRecord], distinct_places: list[int], at_ts: int, half_life_days: float
) -> dict[int, float]:
    """Exponentially decayed visit-frequency share; sums to 1 over distinct_places."""
    decayed: dict[int, float] = defaultdict(float)
    for v in history:
        age_days = max(at_ts - v.end_ts, 0) / MS_PER_DAY
        decayed[v.place_id] += 0.5 ** (age_days / half_life_days)
    total = sum(decayed.values())
    if total <= 0:
        return dict.fromkeys(distinct_places, 0.0)
    return {place_id: decayed.get(place_id, 0.0) / total for place_id in distinct_places}


def predict_next_place(
    history: Sequence[VisitRecord],
    at_ts: int,
    top_k: int = 3,
) -> list[NextPlace]:
    """Most likely next places at `at_ts`, rank 1 first. [] when history is too short."""
    if len(history) < MIN_HISTORY_VISITS:
        return []

    ordered = sorted(history, key=lambda v: v.start_ts)
    distinct_places = sorted({v.place_id for v in ordered})

    transition = _transition_probs(ordered, distinct_places)
    time_of_day = _time_of_day_probs(ordered, distinct_places, at_ts)
    recency = _recency_probs(ordered, distinct_places, at_ts, HALF_LIFE_DAYS_DEFAULT)

    blended = {
        place_id: (1 - NEW_PLACE_MASS)
        * (W_TRANSITION * transition[place_id] + W_TIME * time_of_day[place_id] + W_RECENCY * recency[place_id])
        for place_id in distinct_places
    }

    ranked = sorted(distinct_places, key=lambda place_id: (-blended[place_id], place_id))[:top_k]
    return [
        NextPlace(place_id=place_id, probability=blended[place_id], rank=rank)
        for rank, place_id in enumerate(ranked, start=1)
    ]
