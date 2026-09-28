"""
Reference models to measure Roger's against, for all three tasks.

**Place resolution.** `nearest_baseline` is the honest competitor: pick the
closest candidate. Most of the time on a dense campus that is right, so it sets
the bar the learned ranker has to clear -- if `rank_candidates` cannot beat
"nearest", it is not earning its complexity. `random_baseline` is the sanity
floor. If a ranker scores near it, something is wired up wrong.

**Recommendation.** `popularity_baseline` is the bar from the proposal: the
iteration passes when `recommend_places` beats it on held-out months.
`personal_frequency_baseline` is the strong-but-unfair one, and
`random_recommender` is the floor.

**Prediction.** `most_frequent_place_baseline` answers "wherever you go most",
which on a routine-heavy history is harder to beat than it sounds.

Every baseline here is deterministic and depends only on its arguments, so
evaluating a subset gives the same answers as evaluating the whole set.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections import Counter
from collections.abc import Iterable, Sequence

from app.ml.types import InterestWeight, PlaceCandidate, ScoredCandidate, VisitFeatures
from app.stays import haversine_m

from evaluation.contract import NextPlace, ScoredPlace, VisitRecord
from evaluation.metrics import NONE_PLACE_ID, Ranker
from evaluation.metrics_recommend import Recommender

#: Softmax temperature in meters. At 15 m, a candidate 2 m from the centroid
#: outscores one 20 m away by roughly e^1.2 -- confident but not saturated.
DISTANCE_SCALE_M = 15.0

#: "None of these" competes as though it were a candidate this far away, so a
#: visit whose only candidates sit at the edge of the search radius resolves to
#: nothing rather than to whichever distant shop happened to be closest.
NONE_EQUIVALENT_DISTANCE_M = 35.0


def _softmax(logits: Sequence[float]) -> list[float]:
    if not logits:
        return []
    ceiling = max(logits)
    exps = [math.exp(v - ceiling) for v in logits]
    total = sum(exps)
    return [v / total for v in exps]


def nearest_baseline(visit: VisitFeatures, candidates: Sequence[PlaceCandidate]) -> list[ScoredCandidate]:
    """
    Rank by distance from the visit centroid, with a "none" option in the mix.

    Score is negative distance in meters; confidence is a softmax over
    -distance / DISTANCE_SCALE_M with one extra logit for "none", so the
    confidences of a ranking sum to 1 and a visit with only far-away candidates
    ends up abstaining.
    """
    if not candidates:
        return []
    distances = [haversine_m(visit.lat, visit.lon, c.lat, c.lon) for c in candidates]
    logits = [-d / DISTANCE_SCALE_M for d in distances] + [-NONE_EQUIVALENT_DISTANCE_M / DISTANCE_SCALE_M]
    confidences = _softmax(logits)

    scored = [
        ScoredCandidate(place_id=c.place_id, score=-d, confidence=conf)
        for c, d, conf in zip(candidates, distances, confidences, strict=False)
    ]
    scored.append(
        ScoredCandidate(
            place_id=NONE_PLACE_ID,
            score=-NONE_EQUIVALENT_DISTANCE_M,
            confidence=confidences[-1],
        )
    )
    scored.sort(key=lambda s: (-s.score, s.place_id))
    return scored


nearest_baseline.eval_name = "nearest"  # type: ignore[attr-defined]


def _seed_for(seed: int, visit: VisitFeatures) -> int:
    """
    A per-visit seed derived from the visit itself.

    Hashing the visit rather than advancing one shared RNG means the result does
    not depend on how many visits came before, so evaluating a subset gives the
    same answers as evaluating the whole set. hashlib, not hash(), because
    PYTHONHASHSEED would otherwise make runs differ.
    """
    payload = f"{seed}|{visit.start_ts}|{visit.end_ts}|{visit.lat:.7f}|{visit.lon:.7f}|{visit.radius:.2f}"
    digest = hashlib.blake2b(payload.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def random_baseline(seed: int = 0) -> Ranker:
    """
    A deterministic shuffle: the same (seed, visit) always gives the same order.

    Confidence is uniform over the candidates plus "none", so with the default
    0.35 threshold it assigns only when there are at most two candidates -- a
    floor that is deliberately bad at both ranking and calibration.
    """

    def ranker(visit: VisitFeatures, candidates: Sequence[PlaceCandidate]) -> list[ScoredCandidate]:
        if not candidates:
            return []
        rng = random.Random(_seed_for(seed, visit))
        order = list(candidates)
        rng.shuffle(order)
        confidence = 1.0 / (len(order) + 1)
        scored = [
            ScoredCandidate(place_id=c.place_id, score=float(len(order) - i), confidence=confidence)
            for i, c in enumerate(order)
        ]
        position = rng.randrange(len(scored) + 1)
        scored.insert(
            position,
            ScoredCandidate(place_id=NONE_PLACE_ID, score=float(len(order) - position), confidence=confidence),
        )
        return scored

    ranker.eval_name = f"random(seed={seed})"  # type: ignore[attr-defined]
    return ranker


# --------------------------------------------------------------------------- recommendation


def _times(n: int) -> str:
    return "once" if n == 1 else f"{n} times"


def _rank_by_count(
    counts: Counter[int],
    candidates: Sequence[PlaceCandidate],
    limit: int,
    reason: str,
    *,
    exclude: frozenset[int] = frozenset(),
) -> list[ScoredPlace]:
    """
    Shared shape for the count-based recommenders.

    Score is the count over the top count, so it lands in 0..1 and is comparable
    within one response, as the contract asks. Ties break by place id, never by
    dict order, so two runs agree.
    """
    ranked = sorted(
        (c for c in candidates if counts[c.place_id] > 0 and c.place_id not in exclude),
        key=lambda c: (-counts[c.place_id], c.place_id),
    )[:limit]
    if not ranked:
        return []
    top = counts[ranked[0].place_id]
    return [
        ScoredPlace(
            place_id=c.place_id,
            score=counts[c.place_id] / top,
            reason=reason.format(
                times=_times(counts[c.place_id]), name=c.name or "this place", category=c.category
            ),
        )
        for c in ranked
    ]


def popularity_baseline(corpus: Iterable[VisitRecord], *, exclude_history: bool = True) -> Recommender:
    """
    **The bar from the proposal.** Rank candidates by how often they are visited
    across the whole labeled set, ignoring who the user is.

    `corpus` must be built from *training* visits only. Counting the held-out
    window would let the baseline see the future and the comparison would mean
    nothing; `evaluation/recommend.py` builds it from the training split.

    It excludes places the user has already visited, matching the contract
    `recommend_places` works under, so the two compete on the same task: a
    recommendation is something new. Pass `exclude_history=False` to see the
    naive version that is allowed to re-suggest.
    """
    counts = Counter(visit.place_id for visit in corpus)

    def recommend(
        interests: Sequence[InterestWeight],
        history: Sequence[VisitRecord],
        candidates: Sequence[PlaceCandidate],
        now_ts: int,
        limit: int = 20,
        tz: str = "America/Chicago",
    ) -> list[ScoredPlace]:
        seen = frozenset(v.place_id for v in history) if exclude_history else frozenset()
        return _rank_by_count(counts, candidates, limit, "popular nearby ({times} across the set)", exclude=seen)

    recommend.eval_name = "popularity" if exclude_history else "popularity(incl. visited)"  # type: ignore[attr-defined]
    return recommend


def personal_frequency_baseline(
    interests: Sequence[InterestWeight],
    history: Sequence[VisitRecord],
    candidates: Sequence[PlaceCandidate],
    now_ts: int,
    limit: int = 20,
    tz: str = "America/Chicago",
) -> list[ScoredPlace]:
    """
    Rank by the user's own visit counts: "here are the places you go".

    Strong and slightly unfair. It can only ever re-suggest places already in the
    history, so on the `all` truth set it feeds on revisits -- which are most of
    anyone's week -- while `recommend_places` is barred from returning them at
    all. On the `new` truth set it scores ~0 by construction. It is here as an
    upper bound on "just repeat the routine", not as a competitor: the bar the
    iteration has to clear is `popularity_baseline`.
    """
    counts = Counter(visit.place_id for visit in history)
    return _rank_by_count(counts, candidates, limit, "you have been here {times}")


personal_frequency_baseline.eval_name = "personal_frequency"  # type: ignore[attr-defined]


def _seed_for_case(seed: int, now_ts: int, n_candidates: int) -> int:
    """Per-case seed, derived from the case, for the same reason as `_seed_for`."""
    digest = hashlib.blake2b(f"{seed}|{now_ts}|{n_candidates}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def random_recommender(seed: int = 0) -> Recommender:
    """
    The recommendation floor: shuffle the places the user has not been to.

    The resolution-side floor is `random_baseline`; this is its twin for the
    recommender signature. It excludes history like the real thing does, so it
    is a floor on *ranking* rather than a model that wastes its slots.
    """

    def recommend(
        interests: Sequence[InterestWeight],
        history: Sequence[VisitRecord],
        candidates: Sequence[PlaceCandidate],
        now_ts: int,
        limit: int = 20,
        tz: str = "America/Chicago",
    ) -> list[ScoredPlace]:
        seen = frozenset(v.place_id for v in history)
        pool = sorted((c for c in candidates if c.place_id not in seen), key=lambda c: c.place_id)
        if not pool:
            return []
        rng = random.Random(_seed_for_case(seed, now_ts, len(pool)))
        rng.shuffle(pool)
        chosen = pool[:limit]
        return [
            ScoredPlace(place_id=c.place_id, score=(len(chosen) - i) / len(chosen), reason="random baseline")
            for i, c in enumerate(chosen)
        ]

    recommend.eval_name = f"random(seed={seed})"  # type: ignore[attr-defined]
    return recommend


# --------------------------------------------------------------------------- prediction


def most_frequent_place_baseline(
    history: Sequence[VisitRecord],
    at_ts: int,
    top_k: int = 3,
) -> list[NextPlace]:
    """
    "Wherever you go most, in order." No time of day, no sequence, no recency.

    On a routine-heavy history this is a genuinely strong baseline -- most weeks
    are the same three buildings -- which is exactly why `predict_next_place`
    has to be measured against it rather than against zero. Probabilities are
    the empirical shares, so they sum to <= 1 as the contract requires.
    """
    counts = Counter(visit.place_id for visit in history)
    if not counts:
        return []
    total = sum(counts.values())
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:top_k]
    return [
        NextPlace(place_id=place_id, probability=count / total, rank=rank)
        for rank, (place_id, count) in enumerate(ordered, start=1)
    ]


most_frequent_place_baseline.eval_name = "most_frequent"  # type: ignore[attr-defined]
