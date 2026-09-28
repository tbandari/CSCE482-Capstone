"""
What the real label files say beyond accuracy: agreement, and OSM coverage.

    cd backend && python -m evaluation.agreement \
        evaluation/data/real/george.jsonl evaluation/data/real/agreement/george-blind.jsonl

Two numbers docs/eval/labeling-protocol.md promises to report and nothing else
computes:

**Cohen's κ** over the double-labeled 10%. Plain agreement is not enough -- two
people labeling a campus where 40% of visits are the library agree 40% of the
time by luck alone -- so κ discounts the agreement chance would have produced.
The bands in `KAPPA_BANDS` are the ones the protocol fixed *before* anyone saw a
number, deliberately, so we cannot argue with the result after the fact.

**The coverage gap.** Every label whose notes say the right place was not among
the candidates is a recall failure of the OSM import, not of the ranker. The
protocol asks labelers to write that phrase; this counts them.

Both work on labels only, never the database, so they run on someone's own
machine against files that never leave it.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from evaluation.labels import LabeledVisit, LabelError, load_labels

#: The phrase docs/eval/labeling-protocol.md rule 7 asks labelers to write.
COVERAGE_GAP_NOTE = "correct place not in candidates"

#: Agreed in advance, in the protocol. (floor, verdict).
KAPPA_BANDS: tuple[tuple[float, str], ...] = (
    (0.8, "labels are solid -- report accuracy as-is"),
    (0.6, "usable -- report kappa alongside every accuracy figure"),
    (float("-inf"), "the protocol is ambiguous, not the labelers -- fix the rules and re-label"),
)

#: How a null truth is spelled when κ treats it as just another class.
NONE_CLASS = "none"


def band_for(kappa: float) -> str:
    return next(verdict for floor, verdict in KAPPA_BANDS if kappa >= floor)


def cohen_kappa(a: Sequence[str], b: Sequence[str]) -> float | None:
    """
    Cohen's κ for two labelers over the same items.

    Returns None when κ is undefined -- with no items, or when both labelers
    used exactly one class and chance agreement is 1.0, where the formula is
    0/0. Reporting 0.0 there would read as "they never agreed", which is the
    opposite of what happened.
    """
    if not a or len(a) != len(b):
        return None
    n = len(a)
    observed = sum(1 for x, y in zip(a, b, strict=True) if x == y) / n
    counts_a, counts_b = Counter(a), Counter(b)
    expected = sum(counts_a[c] * counts_b[c] for c in set(counts_a) | set(counts_b)) / (n * n)
    if expected >= 1.0:
        return None
    return (observed - expected) / (1 - expected)


@dataclass(frozen=True, slots=True)
class AgreementReport:
    n_pairs: int
    n_agreed: int
    observed: float | None
    kappa: float | None
    band: str
    only_owner: tuple[str, ...]  # ids the second labeler did not label
    only_blind: tuple[str, ...]  # ids that are not in the owner's file

    @property
    def usable(self) -> bool:
        return self.kappa is not None and self.kappa >= KAPPA_BANDS[1][0]

    def as_dict(self) -> dict:
        return {
            "n_pairs": self.n_pairs,
            "n_agreed": self.n_agreed,
            "observed": self.observed,
            "kappa": self.kappa,
            "band": self.band,
            "only_owner": list(self.only_owner),
            "only_blind": list(self.only_blind),
        }


def _class_of(label: LabeledVisit) -> str:
    return NONE_CLASS if label.truth_place_id is None else str(label.truth_place_id)


def compare(owner: Sequence[LabeledVisit], blind: Sequence[LabeledVisit]) -> AgreementReport:
    """Pair the two files by label id and score the overlap."""
    by_id = {label.id: label for label in owner}
    blind_by_id = {label.id: label for label in blind}
    shared = [label_id for label_id in by_id if label_id in blind_by_id]

    first = [_class_of(by_id[i]) for i in shared]
    second = [_class_of(blind_by_id[i]) for i in shared]
    kappa = cohen_kappa(first, second)
    agreed = sum(1 for x, y in zip(first, second, strict=True) if x == y)

    return AgreementReport(
        n_pairs=len(shared),
        n_agreed=agreed,
        observed=agreed / len(shared) if shared else None,
        kappa=kappa,
        band=band_for(kappa) if kappa is not None else "kappa is undefined for this pair",
        only_owner=tuple(sorted(set(by_id) - set(blind_by_id))),
        only_blind=tuple(sorted(set(blind_by_id) - set(by_id))),
    )


def coverage_gap_count(labels: Sequence[LabeledVisit]) -> int:
    """How many labels say the right place was not on offer. The OSM recall number."""
    return sum(1 for label in labels if COVERAGE_GAP_NOTE in label.notes.lower())


def coverage_gap_places(labels: Sequence[LabeledVisit]) -> list[str]:
    """The place names written after the phrase, for Zayd's import backlog."""
    names = []
    for label in labels:
        lowered = label.notes.lower()
        if COVERAGE_GAP_NOTE not in lowered:
            continue
        _, _, tail = label.notes.partition(":")
        names.append(tail.strip() or "(unnamed)")
    return sorted(names)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m evaluation.agreement",
        description="Cohen's kappa over a double-labeled file, and the OSM coverage gap.",
    )
    parser.add_argument("owner", type=Path, help="the owner's full label file")
    parser.add_argument("blind", type=Path, nargs="?", help="the teammate's blind copy")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        owner = load_labels(args.owner)
        blind = load_labels(args.blind) if args.blind else []
    except (LabelError, FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    gap = coverage_gap_count(owner)
    print(f"    {args.owner.name} · {len(owner)} labels")
    print(f"    OSM coverage gap: {gap} label(s) say the right place was not among the candidates")
    for name in coverage_gap_places(owner):
        print(f"      missing: {name}")

    if not blind:
        print("    no blind copy given, so no agreement to report")
        return 0

    report = compare(owner, blind)
    print()
    print(f"    agreement · {report.n_pairs} double-labeled visit(s)")
    if report.observed is not None:
        print(f"      raw agreement  {report.observed * 100:5.1f}%  ({report.n_agreed}/{report.n_pairs})")
    print(f"      Cohen's kappa  {'n/a' if report.kappa is None else f'{report.kappa:5.2f}'}  -- {report.band}")
    if report.only_blind:
        print(f"      warning: {len(report.only_blind)} blind label(s) have ids not in the owner's file")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
