"""
Place-resolution evaluation CLI.

    cd backend && python -m evaluation.places                 # committed synthetic set
    cd backend && python -m evaluation.places evaluation/data/real/george.jsonl
    cd backend && python -m evaluation.places --sweep --json out.json

Prints one row per ranker so the learned ranker can be read against the
baselines at a glance, then the worst misses for error analysis. Output style
follows docs/reports/assets/stay-eval.txt so the two harnesses read alike in a
report.

Roger's `rank_candidates` is imported lazily: this has to run on a branch where
app/ml/places.py does not exist yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from evaluation.baselines import nearest_baseline, random_baseline
from evaluation.labels import LabelError, LabeledVisit, load_labels
from evaluation.metrics import (
    DEFAULT_MIN_CONFIDENCE,
    DEFAULT_THRESHOLDS,
    PlaceEvalResult,
    Ranker,
    evaluate,
    threshold_sweep,
)

DEFAULT_LABELS = Path(__file__).parent / "data" / "synthetic-places.jsonl"
RANKER_UNAVAILABLE = "rank_candidates not available yet, showing baselines only"


def load_rank_candidates() -> Ranker | None:
    """Roger's ranker if his branch has landed, else None. Never raises."""
    try:
        from app.ml.places import rank_candidates  # noqa: PLC0415  (lazy on purpose)
    except ImportError:
        return None
    return rank_candidates


def _pct(value: float | None) -> str:
    return "     n/a" if value is None else f"{value * 100:6.1f}%"


def format_table(results: Sequence[PlaceEvalResult]) -> str:
    """The headline table: one row per ranker."""
    headings = ("top-1", "top-3", "precision", "recall", "abstain")
    name_width = max([len("ranker")] + [len(r.ranker) for r in results])
    cell = 10  # wide enough for "precision"; _pct renders 7 chars right-aligned

    header = "ranker".ljust(name_width) + "".join(h.rjust(cell) for h in headings) + "  assigned"
    rule = "-" * name_width + "".join(("-" * len(h)).rjust(cell) for h in headings) + "  --------"
    lines = [header, rule]
    for result in results:
        cells = (result.top1, result.top3, result.precision, result.recall, result.abstain_rate)
        lines.append(
            result.ranker.ljust(name_width)
            + "".join(_pct(value).rjust(cell) for value in cells)
            + f"  {result.n_assigned:>4d}/{result.n_labeled}"
        )
    return "\n".join(lines)


def format_misses(result: PlaceEvalResult, limit: int) -> str:
    if not result.misses:
        return f"    {result.ranker}: no misses"
    shown = result.misses[:limit]
    lines = [f"    {result.ranker} · {len(result.misses)} misses, worst {len(shown)} by confidence"]
    lines.extend(f"      {miss.describe()}" for miss in shown)
    return "\n".join(lines)


def format_categories(result: PlaceEvalResult) -> str:
    if not result.per_category:
        return ""
    lines = [f"    {result.ranker} · top-1 by truth category"]
    for score in result.per_category:
        lines.append(f"      {score.category:<12} n={score.n:<3d} {score.top1 * 100:5.1f}%")
    return "\n".join(lines)


def format_sweep(ranker_name: str, rows: Sequence) -> str:
    lines = [
        f"    {ranker_name} · threshold sweep",
        "      thresh  precision   recall  abstain  assigned",
    ]
    for row in rows:
        lines.append(
            f"       {row.threshold:.2f}  {_pct(row.precision)}  {_pct(row.recall)}  "
            f"{_pct(row.abstain_rate)}    {row.n_assigned:3d}"
        )
    return "\n".join(lines)


def describe_set(labels: Sequence[LabeledVisit], sources: Sequence[Path]) -> str:
    with_truth = sum(1 for label in labels if label.has_truth)
    names = ", ".join(p.name for p in sources)
    return (
        f"    Place resolution · {names} · {len(labels)} labeled visits "
        f"({with_truth} with a place, {len(labels) - with_truth} none)"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m evaluation.places",
        description="Score place rankers against hand-labeled (or synthetic) visits.",
    )
    parser.add_argument(
        "labels", nargs="*", type=Path, help=f"JSONL label files (default: {DEFAULT_LABELS.name})"
    )
    parser.add_argument(
        "--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE,
        help=f"assignment threshold, matching ORBIT_PLACE_MIN_CONFIDENCE (default {DEFAULT_MIN_CONFIDENCE})",
    )
    parser.add_argument("--misses", type=int, default=8, help="how many misses to print per ranker (default 8)")
    parser.add_argument("--sweep", action="store_true", help="also print the precision/recall threshold sweep")
    parser.add_argument("--categories", action="store_true", help="also print per-category top-1")
    parser.add_argument("--seed", type=int, default=0, help="seed for the random baseline (default 0)")
    parser.add_argument("--json", type=Path, metavar="OUT", help="write the full results to a JSON file")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    sources = args.labels or [DEFAULT_LABELS]

    try:
        labels = load_labels(sources)
    except (LabelError, FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if not labels:
        print("error: no labels found", file=sys.stderr)
        return 2

    rankers: list[tuple[str, Ranker]] = [
        ("nearest", nearest_baseline),
        (f"random(seed={args.seed})", random_baseline(args.seed)),
    ]
    rank_candidates = load_rank_candidates()
    if rank_candidates is not None:
        rankers.append(("rank_candidates", rank_candidates))

    results = [
        evaluate(ranker, labels, args.min_confidence, name=name, max_misses=None)
        for name, ranker in rankers
    ]

    print(describe_set(labels, sources))
    print(f"    assignment threshold {args.min_confidence:.2f}")
    print()
    print(format_table(results))
    if rank_candidates is None:
        print()
        print(f"    {RANKER_UNAVAILABLE}")

    print()
    for result in results:
        print(format_misses(result, args.misses))
    if args.categories:
        print()
        for result in results:
            print(format_categories(result))
    if args.sweep:
        print()
        for name, ranker in rankers:
            print(format_sweep(name, threshold_sweep(ranker, labels, DEFAULT_THRESHOLDS)))

    if args.json:
        payload = {
            "sources": [str(p) for p in sources],
            "n_labeled": len(labels),
            "min_confidence": args.min_confidence,
            "rank_candidates_available": rank_candidates is not None,
            "results": [r.as_dict() for r in results],
            "sweeps": {
                name: [
                    {
                        "threshold": row.threshold,
                        "precision": row.precision,
                        "recall": row.recall,
                        "abstain_rate": row.abstain_rate,
                        "n_assigned": row.n_assigned,
                    }
                    for row in threshold_sweep(ranker, labels, DEFAULT_THRESHOLDS)
                ]
                for name, ranker in rankers
            },
        }
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print()
        print(f"    wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
