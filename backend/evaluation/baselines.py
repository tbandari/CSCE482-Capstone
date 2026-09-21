"""
Reference rankers to measure Roger's against.

`nearest_baseline` is the honest competitor: pick the closest candidate. Most of
the time on a dense campus that is right, so it sets the bar the learned ranker
has to clear -- if `rank_candidates` cannot beat "nearest", it is not earning
its complexity.

`random_baseline` is the sanity floor. If a ranker scores near it, something is
wired up wrong.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections.abc import Sequence

from app.ml.types import PlaceCandidate, ScoredCandidate, VisitFeatures
from app.stays import haversine_m

from evaluation.metrics import NONE_PLACE_ID, Ranker

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
