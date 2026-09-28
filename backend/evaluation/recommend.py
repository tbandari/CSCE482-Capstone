"""
Recommender evaluation CLI.

    cd backend && python -m evaluation.recommend                      # committed synthetic cohort
    cd backend && python -m evaluation.recommend --user student
    cd backend && python -m evaluation.recommend evaluation/data/real/george-export.json
    cd backend && python -m evaluation.recommend --json out.json

This is the iteration's exit criterion made runnable: **the recommender beats a
popularity baseline on held-out months.** The last line of output says whether
it does, and by how much.

Read the table in this order:

1. **hit-rate@k on new places.** The headline. Every recommender here can
   compete on it, and it is the question the feature actually asks: of the
   places this person went to in the held-out weeks and had never been to
   before, how many did we put in front of them?
2. **coverage.** A recommender can post a decent hit-rate by naming the three
   busiest cafes on campus forever. The distinct places and categories it ever
   suggests say whether that is what it is doing.
3. **the `all held-out places` table.** Revisits included. `personal_frequency`
   wins it by construction and `recommend_places` scores near zero there by
   contract, so it is context, never the verdict.

Roger's `recommend_places` is imported lazily, like `rank_candidates` in
evaluation/places.py: this has to run on a branch where app/ml/recommend.py does
not exist yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from evaluation.baselines import personal_frequency_baseline, popularity_baseline, random_recommender
from evaluation.contract import CONTRACT_INSTALLED
from evaluation.history import HistoryError, load_history
from evaluation.metrics_recommend import (
    DEFAULT_KS,
    HoldoutCase,
    RecommendEvalResult,
    Recommender,
    build_case,
    cutoff_for_last_weeks,
    evaluate_recommender,
)

DEFAULT_DIR = Path(__file__).parent / "data" / "history"
DEFAULT_HOLDOUT_WEEKS = 3.0
RECOMMENDER_UNAVAILABLE = "recommend_places not available yet, showing baselines only"
#: The k the verdict is decided on. 10 is a screenful of Discover cards.
VERDICT_K = 10


def load_recommend_places() -> Recommender | None:
    """Roger's recommender if his branch has landed, else None. Never raises."""
    try:
        from app.ml.recommend import recommend_places  # noqa: PLC0415  (lazy on purpose)
    except ImportError:
        return None
    return recommend_places


def default_sources() -> list[Path]:
    return sorted(DEFAULT_DIR.glob("*.json"))


def build_cases(
    sources: Sequence[Path],
    *,
    holdout_weeks: float = DEFAULT_HOLDOUT_WEEKS,
    cutoff_ts: int | None = None,
    users: Sequence[str] = (),
) -> list[HoldoutCase]:
    """One hold-out case per history file, cut where its `meta` says to."""
    cases = []
    for source in sources:
        history = load_history(source)
        user = str(history.meta.get("student") or source.stem)
        if users and user not in users:
            continue
        cut = cutoff_ts or history.meta.get("holdout_cutoff_ts") or cutoff_for_last_weeks(
            history.visits, holdout_weeks
        )
        cases.append(build_case(history, int(cut), user=user))
    return cases


def _pct(value: float | None) -> str:
    return "    n/a" if value is None else f"{value * 100:5.1f}%"


def format_table(results: Sequence[RecommendEvalResult], scope: str, ks: Sequence[int]) -> str:
    """One row per recommender, for one truth set."""
    name_width = max([len("recommender")] + [len(r.recommender) for r in results])
    headings = [f"hit@{k}" for k in ks] + ["MRR"]

    lines = [
        "recommender".ljust(name_width) + "".join(h.rjust(9) for h in headings) + "   places  cats  leaks",
        "-" * name_width + "".join(("-" * len(h)).rjust(9) for h in headings) + "   ------  ----  -----",
    ]
    for result in results:
        score = result.new_places if scope == "new" else result.all_places
        cells = [score.at(k) for k in ks] + [score.mrr]
        lines.append(
            result.recommender.ljust(name_width)
            + "".join(_pct(v).rjust(9) for v in cells)
            + f"   {result.coverage.places:>6d}  {result.coverage.categories:>4d}  {result.history_leaks:>5d}"
        )
    return "\n".join(lines)


def describe_cases(cases: Sequence[HoldoutCase], sources: Sequence[Path]) -> str:
    train = sum(len(c.train) for c in cases)
    test = sum(len(c.test) for c in cases)
    new = sum(len(c.truth_new) for c in cases)
    allp = sum(len(c.truth_all) for c in cases)
    dropped = sum(c.dropped for c in cases)
    catalog = len({p.place_id for c in cases for p in c.candidates})
    names = ", ".join(sorted(c.user for c in cases)) or "none"
    lines = [
        f"    Recommendation · temporal hold-out · {len(cases)} case(s): {names}",
        f"    {len(sources)} file(s) · {train} training visits, {test} held out"
        + (f" ({dropped} straddled the cutoff and were dropped)" if dropped else ""),
        f"    truth: {new} new places, {allp} distinct held-out places · catalog {catalog} places",
    ]
    return "\n".join(lines)


def format_coverage(result: RecommendEvalResult) -> str:
    coverage = result.coverage
    share = coverage.place_share
    return (
        f"      {result.recommender:<22} {coverage.places:>3d}/{coverage.catalog_places} places"
        f" ({0.0 if share is None else share * 100:4.1f}%), "
        f"{coverage.categories}/{coverage.catalog_categories} categories"
        + (f", {result.empty_responses} empty response(s)" if result.empty_responses else "")
    )


def verdict(results: Sequence[RecommendEvalResult], k: int = VERDICT_K) -> str:
    """The one line the iteration is graded on."""
    by_name = {r.recommender: r for r in results}
    model = by_name.get("recommend_places")
    bar = by_name.get("popularity")
    if model is None:
        return "VERDICT: recommend_places is not installed yet -- no verdict. Baselines are the bar to clear."
    if bar is None:
        return "VERDICT: no popularity baseline in this run -- cannot judge the exit criterion."

    mine = model.new_places.at(k) or 0.0
    theirs = bar.new_places.at(k) or 0.0
    margin = (mine - theirs) * 100
    if mine > theirs:
        return (
            f"VERDICT: recommend_places CLEARS the popularity baseline on new places "
            f"at k={k} ({mine * 100:.1f}% vs {theirs * 100:.1f}%, +{margin:.1f} points)."
        )
    return (
        f"VERDICT: recommend_places does NOT clear the popularity baseline on new places "
        f"at k={k} ({mine * 100:.1f}% vs {theirs * 100:.1f}%, {margin:.1f} points)."
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m evaluation.recommend",
        description="Score recommenders against a popularity baseline on a temporal hold-out.",
    )
    parser.add_argument(
        "history", nargs="*", type=Path, help="history or export JSON files (default: the synthetic cohort)"
    )
    parser.add_argument("--user", action="append", default=[], help="only score these users (repeatable)")
    parser.add_argument(
        "--holdout-weeks", type=float, default=DEFAULT_HOLDOUT_WEEKS,
        help=f"hold-out window when a file does not name its own cutoff (default {DEFAULT_HOLDOUT_WEEKS})",
    )
    parser.add_argument("--cutoff-ts", type=int, help="force one cutoff (epoch ms) for every history")
    parser.add_argument("--limit", type=int, help="how many recommendations to ask for (default max k)")
    parser.add_argument("--seed", type=int, default=0, help="seed for the random baseline (default 0)")
    parser.add_argument("--json", type=Path, metavar="OUT", help="write the full results to a JSON file")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    sources = args.history or default_sources()
    if not sources:
        print(f"error: no history files (looked in {DEFAULT_DIR})", file=sys.stderr)
        return 2

    try:
        cases = build_cases(
            sources, holdout_weeks=args.holdout_weeks, cutoff_ts=args.cutoff_ts, users=args.user
        )
    except (HistoryError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if not cases:
        print("error: no cases to score (did --user match anything?)", file=sys.stderr)
        return 2

    # The corpus is training visits only. Counting the held-out window would let
    # the baseline see the future, and the comparison would mean nothing.
    corpus = [visit for case in cases for visit in case.train]

    recommenders: list[tuple[str, Recommender]] = [
        ("popularity", popularity_baseline(corpus)),
        ("personal_frequency", personal_frequency_baseline),
        (f"random(seed={args.seed})", random_recommender(args.seed)),
    ]
    recommend_places = load_recommend_places()
    if recommend_places is not None:
        recommenders.append(("recommend_places", recommend_places))

    results = [
        evaluate_recommender(rec, cases, ks=DEFAULT_KS, limit=args.limit, name=name)
        for name, rec in recommenders
    ]

    print(describe_cases(cases, sources))
    print()
    print("    new places only -- never visited before the cutoff (the headline)")
    print(format_table(results, "new", DEFAULT_KS))
    unreachable = results[0].new_places.unreachable
    if unreachable:
        print(
            f"    {unreachable} of {results[0].new_places.n} held-out new places are not in the catalog "
            "(OSM coverage gap): a miss for everyone, not a model failure"
        )
    print()
    print("    all held-out places -- revisits included (context, not the verdict)")
    print(format_table(results, "all", DEFAULT_KS))
    print()
    print("    coverage")
    for result in results:
        print(format_coverage(result))
    if recommend_places is None:
        print()
        print(f"    {RECOMMENDER_UNAVAILABLE}")
        if not CONTRACT_INSTALLED:
            print("    (app/ml/types.py has no VisitRecord yet either -- running on evaluation/contract.py)")
    print()
    print(f"    {verdict(results)}")

    if args.json:
        payload = {
            "sources": [str(p) for p in sources],
            "users": [c.user for c in cases],
            "cutoffs": {c.user: c.cutoff_ts for c in cases},
            "ks": list(DEFAULT_KS),
            "verdict_k": VERDICT_K,
            "recommend_places_available": recommend_places is not None,
            "contract_installed": CONTRACT_INSTALLED,
            "results": [r.as_dict() for r in results],
            "verdict": verdict(results),
        }
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print()
        print(f"    wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
