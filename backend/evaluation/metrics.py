"""
Metrics for place resolution.

The harness measures any callable with the `Ranker` signature, so Roger's
`rank_candidates`, the baselines here and anything we try later are all scored
the same way.

Two decisions worth stating, because they are what make the numbers comparable:

*Ranking* quality and *assignment* quality are reported separately. Top-1 and
top-3 ask "is the right place near the top of the list?" and ignore confidence
entirely. Precision, recall and abstain rate ask "given the threshold the API
actually uses, did we write the right place onto the visit?". A ranker can have
excellent top-1 and useless precision if its confidences are badly calibrated,
and we want to see that split rather than average it away.

*Abstention is a first-class answer.* A visit whose truth is null (a parking
lot, a road, somewhere we have no OSM coverage) is correctly handled by
declining to assign, so a ranker that says nothing gets credit for it. A ranker
may also signal "not a place" in-band by ranking NONE_PLACE_ID first.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from app.ml.types import PlaceCandidate, ScoredCandidate, VisitFeatures

from evaluation.labels import LabeledVisit

#: A ranker returns candidates best-first. Roger's `rank_candidates` is one.
Ranker = Callable[[VisitFeatures, Sequence[PlaceCandidate]], list[ScoredCandidate]]

#: In-band "none of these candidates". A ranker that puts this first is
#: abstaining regardless of the threshold. Negative so it can never collide with
#: a real `places.id`.
NONE_PLACE_ID = -1

DEFAULT_MIN_CONFIDENCE = 0.35


@dataclass(frozen=True, slots=True)
class Miss:
    """One visit the ranker got wrong, for error analysis."""

    id: str
    kind: str  # "wrong" (assigned the wrong place) or "missed" (abstained on a real place)
    truth_place_id: int | None
    truth_name: str | None
    truth_category: str | None
    predicted_place_id: int | None
    predicted_name: str | None
    confidence: float
    candidates: int

    def describe(self) -> str:
        truth = f"{self.truth_name or '?'} [{self.truth_category or '?'}]"
        if self.kind == "missed":
            predicted = f"abstained (top conf {self.confidence:.2f})"
        else:
            predicted = f"{self.predicted_name or '?'} (conf {self.confidence:.2f})"
        return f"{self.id}  truth {truth}  ->  {predicted}"


@dataclass(frozen=True, slots=True)
class CategoryScore:
    category: str
    n: int
    top1: float


@dataclass(frozen=True, slots=True)
class PlaceEvalResult:
    """
    Everything one (ranker, threshold) pair produced.

    `precision` is None -- not 0.0 -- when the ranker assigned nothing at all.
    Zero would read as "everything it assigned was wrong", which is a different
    and much worse claim than "it never committed".
    """

    ranker: str
    min_confidence: float
    n_labeled: int
    n_with_truth: int
    n_null_truth: int
    n_assigned: int
    n_assigned_correct: int
    top1: float | None
    top3: float | None
    precision: float | None
    recall: float | None
    abstain_rate: float
    correct_abstentions: int
    per_category: tuple[CategoryScore, ...] = ()
    misses: tuple[Miss, ...] = ()

    @property
    def f1(self) -> float | None:
        if self.precision is None or self.recall is None:
            return None
        if self.precision + self.recall == 0:
            return 0.0
        return 2 * self.precision * self.recall / (self.precision + self.recall)

    def as_dict(self) -> dict:
        return {
            "ranker": self.ranker,
            "min_confidence": self.min_confidence,
            "n_labeled": self.n_labeled,
            "n_with_truth": self.n_with_truth,
            "n_null_truth": self.n_null_truth,
            "n_assigned": self.n_assigned,
            "n_assigned_correct": self.n_assigned_correct,
            "top1": self.top1,
            "top3": self.top3,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "abstain_rate": self.abstain_rate,
            "correct_abstentions": self.correct_abstentions,
            "per_category": [
                {"category": c.category, "n": c.n, "top1": c.top1} for c in self.per_category
            ],
            "misses": [
                {
                    "id": m.id,
                    "kind": m.kind,
                    "truth_place_id": m.truth_place_id,
                    "truth_name": m.truth_name,
                    "truth_category": m.truth_category,
                    "predicted_place_id": m.predicted_place_id,
                    "predicted_name": m.predicted_name,
                    "confidence": m.confidence,
                    "candidates": m.candidates,
                }
                for m in self.misses
            ],
        }


@dataclass(frozen=True, slots=True)
class SweepRow:
    threshold: float
    precision: float | None
    recall: float | None
    abstain_rate: float
    n_assigned: int


def _ranker_name(ranker: Ranker) -> str:
    return getattr(ranker, "eval_name", None) or getattr(ranker, "__name__", None) or type(ranker).__name__


def _top_place_ids(ranked: Sequence[ScoredCandidate], k: int) -> list[int]:
    """The first k real place ids. NONE_PLACE_ID occupies a slot but never matches."""
    return [c.place_id for c in ranked[:k]]


def evaluate(
    ranker: Ranker,
    labeled: Sequence[LabeledVisit],
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    *,
    name: str | None = None,
    max_misses: int | None = None,
) -> PlaceEvalResult:
    """Score `ranker` over `labeled`. Pure: it calls the ranker once per visit."""
    n_with_truth = sum(1 for label in labeled if label.has_truth)
    n_null_truth = len(labeled) - n_with_truth

    top1_hits = 0
    top3_hits = 0
    n_assigned = 0
    n_assigned_correct = 0
    correct_abstentions = 0
    misses: list[Miss] = []
    by_category: dict[str, list[int]] = {}

    for label in labeled:
        ranked = list(ranker(label.visit, label.candidates))
        best = ranked[0] if ranked else None

        assigned_id: int | None = None
        confidence = best.confidence if best is not None else 0.0
        if best is not None and best.place_id != NONE_PLACE_ID and best.confidence >= min_confidence:
            assigned_id = best.place_id
            n_assigned += 1

        if label.has_truth:
            truth = label.truth
            assert truth is not None  # has_truth guarantees it; load_labels validated membership
            hit1 = label.truth_place_id in _top_place_ids(ranked, 1)
            top1_hits += int(hit1)
            top3_hits += int(label.truth_place_id in _top_place_ids(ranked, 3))
            by_category.setdefault(truth.category, []).append(int(hit1))

            if assigned_id == label.truth_place_id:
                n_assigned_correct += 1
            else:
                predicted = label.candidate(assigned_id) if assigned_id is not None else None
                misses.append(
                    Miss(
                        id=label.id,
                        kind="wrong" if assigned_id is not None else "missed",
                        truth_place_id=label.truth_place_id,
                        truth_name=truth.name,
                        truth_category=truth.category,
                        predicted_place_id=assigned_id,
                        predicted_name=predicted.name if predicted else None,
                        confidence=confidence,
                        candidates=len(label.candidates),
                    )
                )
        else:
            if assigned_id is None:
                correct_abstentions += 1
            else:
                predicted = label.candidate(assigned_id)
                misses.append(
                    Miss(
                        id=label.id,
                        kind="wrong",
                        truth_place_id=None,
                        truth_name=None,
                        truth_category=None,
                        predicted_place_id=assigned_id,
                        predicted_name=predicted.name if predicted else None,
                        confidence=confidence,
                        candidates=len(label.candidates),
                    )
                )

    misses.sort(key=lambda m: -m.confidence)
    if max_misses is not None:
        misses = misses[:max_misses]

    per_category = tuple(
        sorted(
            (
                CategoryScore(category=category, n=len(hits), top1=sum(hits) / len(hits))
                for category, hits in by_category.items()
            ),
            key=lambda c: (-c.n, c.category),
        )
    )

    return PlaceEvalResult(
        ranker=name or _ranker_name(ranker),
        min_confidence=min_confidence,
        n_labeled=len(labeled),
        n_with_truth=n_with_truth,
        n_null_truth=n_null_truth,
        n_assigned=n_assigned,
        n_assigned_correct=n_assigned_correct,
        top1=top1_hits / n_with_truth if n_with_truth else None,
        top3=top3_hits / n_with_truth if n_with_truth else None,
        precision=n_assigned_correct / n_assigned if n_assigned else None,
        recall=n_assigned_correct / n_with_truth if n_with_truth else None,
        abstain_rate=(len(labeled) - n_assigned) / len(labeled) if labeled else 0.0,
        correct_abstentions=correct_abstentions,
        per_category=per_category,
        misses=tuple(misses),
    )


DEFAULT_THRESHOLDS: tuple[float, ...] = (0.0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)


def threshold_sweep(
    ranker: Ranker,
    labeled: Sequence[LabeledVisit],
    thresholds: Sequence[float] = DEFAULT_THRESHOLDS,
) -> list[SweepRow]:
    """
    The precision/recall curve as the assignment threshold moves.

    Abstain rate is non-decreasing in the threshold by construction: raising the
    bar can only turn assignments into abstentions, never the reverse.
    """
    rows = []
    for threshold in sorted(thresholds):
        result = evaluate(ranker, labeled, threshold)
        rows.append(
            SweepRow(
                threshold=threshold,
                precision=result.precision,
                recall=result.recall,
                abstain_rate=result.abstain_rate,
                n_assigned=result.n_assigned,
            )
        )
    return rows
