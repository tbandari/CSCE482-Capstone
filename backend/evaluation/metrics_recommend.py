"""
Metrics for the recommender, under a temporal hold-out.

The protocol matters more than the number, so it is written down here rather
than left implicit in the CLI:

**Split by time, never at random.** Pick a cutoff, build the interest profile
from visits that *finished* before it, and ask whether the places the user
actually went to *after* it turn up in the top-k. Shuffling visits and holding
out 20% would let the model see next week while predicting this one, and every
number it produced would be worthless.

**Two truth sets, reported side by side.** `new` counts only held-out places the
user had never visited in training; `all` counts every distinct held-out place.
`recommend_places` is contractually barred from returning a place already in
history, so it can never score on a revisit -- and `personal_frequency_baseline`
does nothing *but* revisits. One column each keeps both facts visible instead of
letting the choice of denominator decide the winner. **`new` is the headline**:
it is the only one both sides can compete on, and discovery is what the feature
is for.

**Unreachable truth is a miss for everyone, counted separately.** A held-out
visit to a place missing from the candidate catalog is an OSM coverage gap. It
stays in the denominator -- pretending it did not happen would flatter every
recommender equally -- and is reported as `unreachable` so nobody reads a
coverage gap as a model failure.

**Coverage is reported next to hit-rate.** A recommender that names the same
three cafes forever can post a respectable hit-rate on a routine-heavy history.
Counting the distinct places and categories it ever suggests makes that visible.

Aggregation is micro-averaged over (case, held-out place) pairs, not over users:
with one synthetic history, per-user averaging would have a sample size of one.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Mapping, Sequence
from dataclasses import dataclass

from app.ml.interests import build_interest_profile
from app.ml.types import InterestWeight, PlaceCandidate, VisitFeatures

from evaluation.contract import ScoredPlace, VisitRecord
from evaluation.history import History

#: A recommender returns places best-first. Roger's `recommend_places` is one;
#: it is always called as (interests, history, candidates, now_ts, limit=...).
Recommender = Callable[..., Sequence[ScoredPlace]]

#: The k values the report quotes. 20 is also the default response `limit`.
DEFAULT_KS: tuple[int, ...] = (5, 10, 20)


def split_history(
    visits: Sequence[VisitRecord], cutoff_ts: int
) -> tuple[tuple[VisitRecord, ...], tuple[VisitRecord, ...]]:
    """
    Split a history at `cutoff_ts` into (train, test).

    Train is everything that had *finished* by the cutoff (`end_ts <= cutoff_ts`);
    test is everything that had not started (`start_ts >= cutoff_ts`). A visit
    straddling the instant of the cutoff belongs to neither: putting it in train
    leaks part of the future into the profile, and putting it in test scores the
    model on somewhere the user was already sitting. It is dropped, and
    `HoldoutCase.dropped` counts how many.
    """
    train = tuple(v for v in visits if v.end_ts <= cutoff_ts)
    test = tuple(v for v in visits if v.start_ts >= cutoff_ts)
    return train, test


def cutoff_for_last_weeks(visits: Sequence[VisitRecord], weeks: float) -> int:
    """The timestamp `weeks` before the end of the history: the usual hold-out."""
    if not visits:
        return 0
    return max(v.end_ts for v in visits) - int(weeks * 7 * 86_400_000)


def profile_from_history(
    visits: Sequence[VisitRecord],
    catalog: Mapping[int, PlaceCandidate],
    now_ts: int,
    hidden: Collection[str] = (),
) -> list[InterestWeight]:
    """
    Run the real interest model over a stretch of history.

    The harness measures the recommender on the profile the app would actually
    hand it, so this calls `build_interest_profile` rather than inventing
    weights. A visit to a place outside the catalog still counts -- its category
    is on the `VisitRecord` -- with a placeholder candidate, since the interest
    model reads only timestamps and category, never coordinates.
    """
    pairs: list[tuple[VisitFeatures, PlaceCandidate]] = []
    for visit in visits:
        place = catalog.get(visit.place_id) or PlaceCandidate(
            place_id=visit.place_id, name=None, category=visit.category, lat=0.0, lon=0.0
        )
        pairs.append(
            (
                VisitFeatures(
                    start_ts=visit.start_ts, end_ts=visit.end_ts, lat=place.lat, lon=place.lon, radius=0.0
                ),
                place,
            )
        )
    return build_interest_profile(pairs, hidden=hidden, now_ts=now_ts)


@dataclass(frozen=True, slots=True)
class HoldoutCase:
    """One (user, cutoff) pair: what the model may see, and what it is scored on."""

    user: str
    cutoff_ts: int
    train: tuple[VisitRecord, ...]
    test: tuple[VisitRecord, ...]
    candidates: tuple[PlaceCandidate, ...]
    interests: tuple[InterestWeight, ...]
    dropped: int = 0

    @property
    def catalog_ids(self) -> frozenset[int]:
        return frozenset(c.place_id for c in self.candidates)

    @property
    def seen_ids(self) -> frozenset[int]:
        return frozenset(v.place_id for v in self.train)

    @property
    def truth_all(self) -> tuple[int, ...]:
        """Distinct held-out places, in the order they were first visited."""
        ordered: list[int] = []
        for visit in self.test:
            if visit.place_id not in ordered:
                ordered.append(visit.place_id)
        return tuple(ordered)

    @property
    def truth_new(self) -> tuple[int, ...]:
        seen = self.seen_ids
        return tuple(p for p in self.truth_all if p not in seen)

    def truth(self, scope: str) -> tuple[int, ...]:
        return self.truth_new if scope == "new" else self.truth_all


def build_case(
    history: History,
    cutoff_ts: int,
    *,
    user: str = "synthetic",
    hidden: Collection[str] = (),
) -> HoldoutCase:
    """Split `history` at the cutoff and build the profile from the training half only."""
    train, test = split_history(history.visits, cutoff_ts)
    catalog = history.catalog
    return HoldoutCase(
        user=user,
        cutoff_ts=cutoff_ts,
        train=train,
        test=test,
        candidates=history.places,
        interests=tuple(profile_from_history(train, catalog, cutoff_ts, hidden)),
        dropped=len(history.visits) - len(train) - len(test),
    )


@dataclass(frozen=True, slots=True)
class TruthScore:
    """Hit-rate and MRR over one truth set."""

    scope: str  # "new" (places never visited in training) or "all"
    n: int  # (case, held-out place) pairs scored
    unreachable: int  # of those, places absent from the candidate catalog
    hit_rate: tuple[tuple[int, float], ...]  # (k, rate), ascending k
    mrr: float

    def at(self, k: int) -> float | None:
        return next((rate for kk, rate in self.hit_rate if kk == k), None)

    @property
    def reachable(self) -> int:
        return self.n - self.unreachable

    def as_dict(self) -> dict:
        return {
            "scope": self.scope,
            "n": self.n,
            "unreachable": self.unreachable,
            "hit_rate": {str(k): rate for k, rate in self.hit_rate},
            "mrr": self.mrr,
        }


@dataclass(frozen=True, slots=True)
class Coverage:
    """How much of the catalog a recommender is willing to name."""

    places: int
    categories: int
    catalog_places: int
    catalog_categories: int

    @property
    def place_share(self) -> float | None:
        return self.places / self.catalog_places if self.catalog_places else None

    @property
    def category_share(self) -> float | None:
        return self.categories / self.catalog_categories if self.catalog_categories else None

    def as_dict(self) -> dict:
        return {
            "places": self.places,
            "categories": self.categories,
            "catalog_places": self.catalog_places,
            "catalog_categories": self.catalog_categories,
            "place_share": self.place_share,
            "category_share": self.category_share,
        }


@dataclass(frozen=True, slots=True)
class RecommendEvalResult:
    recommender: str
    limit: int
    n_cases: int
    new_places: TruthScore  # the headline
    all_places: TruthScore
    coverage: Coverage
    history_leaks: int  # recommended places the user had already visited
    empty_responses: int  # cases where it returned nothing at all

    def as_dict(self) -> dict:
        return {
            "recommender": self.recommender,
            "limit": self.limit,
            "n_cases": self.n_cases,
            "new_places": self.new_places.as_dict(),
            "all_places": self.all_places.as_dict(),
            "coverage": self.coverage.as_dict(),
            "history_leaks": self.history_leaks,
            "empty_responses": self.empty_responses,
        }


def _recommender_name(recommender: Recommender) -> str:
    return (
        getattr(recommender, "eval_name", None)
        or getattr(recommender, "__name__", None)
        or type(recommender).__name__
    )


def _ordered_unique(scored: Sequence[ScoredPlace]) -> list[int]:
    """Place ids best-first, first occurrence wins. A repeat never earns a second slot."""
    seen: set[int] = set()
    ids: list[int] = []
    for item in scored:
        if item.place_id in seen:
            continue
        seen.add(item.place_id)
        ids.append(item.place_id)
    return ids


def evaluate_recommender(
    recommender: Recommender,
    cases: Sequence[HoldoutCase],
    *,
    ks: Sequence[int] = DEFAULT_KS,
    limit: int | None = None,
    name: str | None = None,
) -> RecommendEvalResult:
    """
    Score `recommender` over the hold-out cases. Calls it once per case.

    The response is truncated to `limit` before scoring, so a recommender that
    ignores the argument and returns the whole catalog cannot buy hit-rate with
    length.
    """
    ks = tuple(sorted(set(ks)))
    limit = limit or max(ks)

    hits: dict[str, dict[int, int]] = {"new": dict.fromkeys(ks, 0), "all": dict.fromkeys(ks, 0)}
    totals = {"new": 0, "all": 0}
    unreachable = {"new": 0, "all": 0}
    rr_sum = {"new": 0.0, "all": 0.0}

    suggested_places: set[int] = set()
    suggested_categories: set[str] = set()
    catalog_places: set[int] = set()
    catalog_categories: set[str] = set()
    history_leaks = 0
    empty_responses = 0

    for case in cases:
        catalog = case.catalog_ids
        by_id = {c.place_id: c for c in case.candidates}
        catalog_places |= catalog
        catalog_categories |= {c.category for c in case.candidates}

        ranked = _ordered_unique(
            list(recommender(case.interests, case.train, case.candidates, case.cutoff_ts, limit=limit))
        )[:limit]
        if not ranked:
            empty_responses += 1

        position = {place_id: index + 1 for index, place_id in enumerate(ranked)}
        suggested_places |= set(ranked)
        suggested_categories |= {by_id[p].category for p in ranked if p in by_id}
        history_leaks += sum(1 for p in ranked if p in case.seen_ids)

        for scope in ("new", "all"):
            for truth_id in case.truth(scope):
                totals[scope] += 1
                if truth_id not in catalog:
                    unreachable[scope] += 1
                rank = position.get(truth_id)
                if rank is None:
                    continue
                rr_sum[scope] += 1.0 / rank
                for k in ks:
                    if rank <= k:
                        hits[scope][k] += 1

    def score(scope: str) -> TruthScore:
        n = totals[scope]
        return TruthScore(
            scope=scope,
            n=n,
            unreachable=unreachable[scope],
            hit_rate=tuple((k, (hits[scope][k] / n if n else 0.0)) for k in ks),
            mrr=rr_sum[scope] / n if n else 0.0,
        )

    return RecommendEvalResult(
        recommender=name or _recommender_name(recommender),
        limit=limit,
        n_cases=len(cases),
        new_places=score("new"),
        all_places=score("all"),
        coverage=Coverage(
            places=len(suggested_places),
            categories=len(suggested_categories),
            catalog_places=len(catalog_places),
            catalog_categories=len(catalog_categories),
        ),
        history_leaks=history_leaks,
        empty_responses=empty_responses,
    )
