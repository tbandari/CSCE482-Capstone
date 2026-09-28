"""
Next-place prediction evaluation, and its CLI.

    cd backend && python -m evaluation.predict                      # the committed synthetic student
    cd backend && python -m evaluation.predict evaluation/data/real/george-export.json
    cd backend && python -m evaluation.predict --json out.json

The protocol is a **walk-forward** over one history: for every visit after the
first `MIN_HISTORY`, predict from everything strictly before it and compare
against where the user actually went. Every prediction is made from that
moment's past only, which is what the app does at runtime, and it gives one
evaluation point per visit instead of one per user.

Top-1 and top-3 accuracy are the proposal's metrics. They are also sliced by
time of day and by weekday/weekend, because a predictor that is excellent on
Tuesday mornings and useless at 9pm has an average that describes neither, and
the slices are what tell Roger which of the two to work on.

`predict_next_place` is imported lazily, like `rank_candidates` in
evaluation/places.py: this has to run on a branch where app/ml/predict.py does
not exist yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from evaluation.baselines import most_frequent_place_baseline
from evaluation.contract import NextPlace, VisitRecord
from evaluation.history import History, HistoryError, load_history

#: A predictor takes the past and a moment, and returns places best-first.
#: Roger's `predict_next_place` is one.
Predictor = Callable[..., Sequence[NextPlace]]

#: Below this many prior visits there is nothing to learn from, and the contract
#: says `predict_next_place` returns []. Scoring those would measure the warm-up,
#: not the model.
MIN_HISTORY = 5

DEFAULT_TZ = "America/Chicago"
DEFAULT_HISTORY = Path(__file__).parent / "data" / "history" / "student.json"
PREDICTOR_UNAVAILABLE = "predict_next_place not available yet, showing the baseline only"

#: Local-hour bucket boundaries. Named so a row in the report reads as a claim
#: about someone's day rather than as an hour range.
TIME_OF_DAY: tuple[tuple[str, int, int], ...] = (
    ("night", 0, 6),
    ("morning", 6, 12),
    ("afternoon", 12, 17),
    ("evening", 17, 24),
)


def load_predict_next_place() -> Predictor | None:
    """Roger's predictor if his branch has landed, else None. Never raises."""
    try:
        from app.ml.predict import predict_next_place  # noqa: PLC0415  (lazy on purpose)
    except ImportError:
        return None
    return predict_next_place


def walk_forward(
    visits: Sequence[VisitRecord], min_history: int = MIN_HISTORY
) -> Iterator[tuple[tuple[VisitRecord, ...], VisitRecord]]:
    """Yield (everything before this visit, this visit) for each scorable visit."""
    for index in range(min_history, len(visits)):
        yield tuple(visits[:index]), visits[index]


def _local(ts: int, tz: str) -> datetime:
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).astimezone(ZoneInfo(tz))


def time_of_day(ts: int, tz: str = DEFAULT_TZ) -> str:
    hour = _local(ts, tz).hour
    for name, start, end in TIME_OF_DAY:
        if start <= hour < end:
            return name
    return TIME_OF_DAY[-1][0]  # unreachable for a valid hour; keeps the return total


def day_type(ts: int, tz: str = DEFAULT_TZ) -> str:
    return "weekend" if _local(ts, tz).weekday() >= 5 else "weekday"


@dataclass(frozen=True, slots=True)
class SliceScore:
    name: str
    n: int
    top1: float
    top3: float

    def as_dict(self) -> dict:
        return {"name": self.name, "n": self.n, "top1": self.top1, "top3": self.top3}


@dataclass(frozen=True, slots=True)
class PredictEvalResult:
    predictor: str
    n: int  # predictions scored
    n_empty: int  # times it declined to answer at all
    top1: float | None
    top3: float | None
    by_time_of_day: tuple[SliceScore, ...]
    by_day_type: tuple[SliceScore, ...]
    contract_violations: int  # ranks out of order, or probabilities summing past 1

    def as_dict(self) -> dict:
        return {
            "predictor": self.predictor,
            "n": self.n,
            "n_empty": self.n_empty,
            "top1": self.top1,
            "top3": self.top3,
            "by_time_of_day": [s.as_dict() for s in self.by_time_of_day],
            "by_day_type": [s.as_dict() for s in self.by_day_type],
            "contract_violations": self.contract_violations,
        }


def _predictor_name(predictor: Predictor) -> str:
    return (
        getattr(predictor, "eval_name", None)
        or getattr(predictor, "__name__", None)
        or type(predictor).__name__
    )


def _violates_contract(predictions: Sequence[NextPlace]) -> bool:
    """Ranks must be 1..n in order and probabilities must sum to at most 1."""
    if not predictions:
        return False
    if [p.rank for p in predictions] != list(range(1, len(predictions) + 1)):
        return True
    return sum(p.probability for p in predictions) > 1.0 + 1e-9


def evaluate_predictor(
    predictor: Predictor,
    visits: Sequence[VisitRecord],
    *,
    top_k: int = 3,
    min_history: int = MIN_HISTORY,
    tz: str = DEFAULT_TZ,
    name: str | None = None,
) -> PredictEvalResult:
    """Walk `visits` forward, scoring one prediction per visit past the warm-up."""
    total = 0
    top1_hits = 0
    top3_hits = 0
    empty = 0
    violations = 0
    slices: dict[str, dict[str, list[tuple[int, int]]]] = {"tod": {}, "day": {}}

    for past, actual in walk_forward(visits, min_history):
        predicted = list(predictor(past, actual.start_ts, top_k=top_k))[:top_k]
        if not predicted:
            empty += 1
        if _violates_contract(predicted):
            violations += 1

        ids = [p.place_id for p in predicted]
        hit1 = int(bool(ids) and ids[0] == actual.place_id)
        hit3 = int(actual.place_id in ids[:3])
        total += 1
        top1_hits += hit1
        top3_hits += hit3
        slices["tod"].setdefault(time_of_day(actual.start_ts, tz), []).append((hit1, hit3))
        slices["day"].setdefault(day_type(actual.start_ts, tz), []).append((hit1, hit3))

    def scores(bucket: str, order: Sequence[str]) -> tuple[SliceScore, ...]:
        rows = slices[bucket]
        named = [n for n in order if n in rows] + sorted(n for n in rows if n not in order)
        return tuple(
            SliceScore(
                name=n,
                n=len(rows[n]),
                top1=sum(h1 for h1, _ in rows[n]) / len(rows[n]),
                top3=sum(h3 for _, h3 in rows[n]) / len(rows[n]),
            )
            for n in named
        )

    return PredictEvalResult(
        predictor=name or _predictor_name(predictor),
        n=total,
        n_empty=empty,
        top1=top1_hits / total if total else None,
        top3=top3_hits / total if total else None,
        by_time_of_day=scores("tod", [name for name, _, _ in TIME_OF_DAY]),
        by_day_type=scores("day", ["weekday", "weekend"]),
        contract_violations=violations,
    )


# --------------------------------------------------------------------------- CLI


def _pct(value: float | None) -> str:
    return "     n/a" if value is None else f"{value * 100:6.1f}%"


def format_table(results: Sequence[PredictEvalResult]) -> str:
    headings = ("top-1", "top-3")
    name_width = max([len("predictor")] + [len(r.predictor) for r in results])
    cell = 10

    lines = [
        "predictor".ljust(name_width) + "".join(h.rjust(cell) for h in headings) + "  predictions  declined",
        "-" * name_width + "".join(("-" * len(h)).rjust(cell) for h in headings) + "  -----------  --------",
    ]
    for result in results:
        lines.append(
            result.predictor.ljust(name_width)
            + "".join(_pct(v).rjust(cell) for v in (result.top1, result.top3))
            + f"  {result.n:>11d}  {result.n_empty:>8d}"
        )
    return "\n".join(lines)


def format_slices(result: PredictEvalResult) -> str:
    lines = [f"    {result.predictor} · accuracy by slice"]
    for label, rows in (("time of day", result.by_time_of_day), ("day type", result.by_day_type)):
        lines.append(f"      {label}")
        for row in rows:
            lines.append(f"        {row.name:<12} n={row.n:<4d} top-1 {_pct(row.top1)}  top-3 {_pct(row.top3)}")
    return "\n".join(lines)


def describe_history(history: History, source: Path, scored: int) -> str:
    start, end = history.span_ts
    days = (end - start) / 86_400_000 if end > start else 0
    tag = "SYNTHETIC" if history.meta.get("synthetic") else "real export"
    return (
        f"    Next-place prediction · {source.name} ({tag}) · {len(history.visits)} visits "
        f"over {days:.0f} days · {scored} scored after a {MIN_HISTORY}-visit warm-up"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m evaluation.predict",
        description="Score next-place predictors by walking one history forward.",
    )
    parser.add_argument(
        "history", nargs="?", type=Path, help=f"history or export JSON (default: {DEFAULT_HISTORY.name})"
    )
    parser.add_argument("--top-k", type=int, default=3, help="how many predictions to ask for (default 3)")
    parser.add_argument(
        "--min-history", type=int, default=MIN_HISTORY, help=f"warm-up visits to skip (default {MIN_HISTORY})"
    )
    parser.add_argument("--tz", default=DEFAULT_TZ, help=f"timezone for the slices (default {DEFAULT_TZ})")
    parser.add_argument("--json", type=Path, metavar="OUT", help="write the full results to a JSON file")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    source = args.history or DEFAULT_HISTORY

    try:
        history = load_history(source)
    except (HistoryError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if len(history.visits) <= args.min_history:
        print(
            f"error: {source} has {len(history.visits)} visits, need more than {args.min_history}",
            file=sys.stderr,
        )
        return 2

    predictors: list[tuple[str, Predictor]] = [("most_frequent", most_frequent_place_baseline)]
    predict_next_place = load_predict_next_place()
    if predict_next_place is not None:
        predictors.append(("predict_next_place", predict_next_place))

    results = [
        evaluate_predictor(
            predictor, history.visits, top_k=args.top_k, min_history=args.min_history, tz=args.tz, name=name
        )
        for name, predictor in predictors
    ]

    print(describe_history(history, Path(source), results[0].n))
    print()
    print(format_table(results))
    if predict_next_place is None:
        print()
        print(f"    {PREDICTOR_UNAVAILABLE}")
    print()
    for result in results:
        print(format_slices(result))
        if result.contract_violations:
            print(
                f"      warning: {result.contract_violations} responses broke the NextPlace contract "
                "(rank order, or probabilities summing past 1)"
            )

    if args.json:
        payload = {
            "source": str(source),
            "n_visits": len(history.visits),
            "min_history": args.min_history,
            "top_k": args.top_k,
            "tz": args.tz,
            "predict_next_place_available": predict_next_place is not None,
            "results": [r.as_dict() for r in results],
        }
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print()
        print(f"    wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
