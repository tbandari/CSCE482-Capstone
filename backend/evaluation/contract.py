"""
The Part-2 contract types, importable whether or not Roger's PR has landed.

`VisitRecord`, `ScoredPlace` and `NextPlace` belong to `app/ml/types.py` --
Roger owns that file and adds them in his day-1 PR. The harness has to run
before that merges (that is the whole point of measuring on a branch), and
`backend/evaluation/` may not edit `app/ml/`, so this module re-exports the real
types when they exist and defines structurally identical stand-ins when they do
not.

Nothing here does isinstance checks, on either side of that swap: the harness
reads `.place_id`, `.score`, `.probability` and `.rank` off whatever the model
returns. So a `ScoredPlace` built by `app.ml.recommend` and one built here are
interchangeable to every metric in this package.

`CONTRACT_INSTALLED` says which half is in use, so a CLI can print it rather
than quietly reporting numbers from a shim.
"""

from __future__ import annotations

from dataclasses import dataclass

try:  # pragma: no cover - the branch taken depends on whether Roger's PR has merged
    from app.ml.types import NextPlace, ScoredPlace, VisitRecord

    CONTRACT_INSTALLED = True
except ImportError:
    CONTRACT_INSTALLED = False

    @dataclass(frozen=True, slots=True)
    class VisitRecord:  # type: ignore[no-redef]
        """One resolved visit from a user's history, oldest first when in a sequence."""

        start_ts: int  # epoch ms, UTC
        end_ts: int  # epoch ms, UTC
        place_id: int
        category: str  # one of CATEGORIES

    @dataclass(frozen=True, slots=True)
    class ScoredPlace:  # type: ignore[no-redef]
        place_id: int
        score: float  # 0..1, comparable within one response
        reason: str  # one short human-readable line, e.g. "matches your interest in cafés"

    @dataclass(frozen=True, slots=True)
    class NextPlace:  # type: ignore[no-redef]
        place_id: int
        probability: float  # 0..1; probabilities of one prediction sum to <= 1
        rank: int  # 1-based


__all__ = ["CONTRACT_INSTALLED", "NextPlace", "ScoredPlace", "VisitRecord"]
