"""
Tests for inter-annotator agreement and the OSM coverage count.

Cohen's κ decides whether we are allowed to report an accuracy number at all
(docs/eval/labeling-protocol.md fixes the bands in advance), so the arithmetic
is pinned to hand-computed examples.
"""

from __future__ import annotations

import pytest

from app.ml.types import PlaceCandidate, VisitFeatures

from evaluation.agreement import (
    KAPPA_BANDS,
    band_for,
    cohen_kappa,
    compare,
    coverage_gap_count,
    coverage_gap_places,
)
from evaluation.labels import LabeledVisit, write_labels

LIBRARY = PlaceCandidate(1, "Evans Library", "library", 30.6160, -96.3393)
CAFE = PlaceCandidate(2, "Library Coffee Bar", "cafe", 30.61610, -96.33922)


def labeled(label_id: str, truth: int | None, labeler: str = "george", notes: str = "") -> LabeledVisit:
    return LabeledVisit(
        id=label_id,
        visit=VisitFeatures(start_ts=0, end_ts=600_000, lat=30.616, lon=-96.3393, radius=20.0),
        candidates=(LIBRARY, CAFE),
        truth_place_id=truth,
        labeler=labeler,
        notes=notes,
    )


# --------------------------------------------------------------------------- kappa


def test_perfect_agreement_is_one():
    assert cohen_kappa(["1", "2", "1", "3"], ["1", "2", "1", "3"]) == 1.0


def test_hand_computed_kappa():
    """
    Six items, agreeing on four.

      observed = 4/6 = 0.6667
      each labeler used '1' three times and '2' three times,
      so expected = (3*3 + 3*3) / 36 = 0.5
      kappa = (0.6667 - 0.5) / (1 - 0.5) = 1/3
    """
    a = ["1", "2", "1", "2", "1", "2"]
    b = ["1", "2", "2", "1", "1", "2"]
    assert cohen_kappa(a, b) == pytest.approx(1 / 3)


def test_chance_level_agreement_is_zero():
    a = ["1", "1", "2", "2"]
    b = ["1", "2", "1", "2"]
    assert cohen_kappa(a, b) == pytest.approx(0.0)


def test_systematic_disagreement_is_negative():
    assert cohen_kappa(["1", "2"], ["2", "1"]) < 0


def test_kappa_is_undefined_rather_than_zero_when_everyone_says_the_same_thing():
    """Two labelers who only ever used one class agreed perfectly, not by chance."""
    assert cohen_kappa(["1", "1", "1"], ["1", "1", "1"]) is None


def test_kappa_is_undefined_for_no_items():
    assert cohen_kappa([], []) is None


def test_bands_come_from_the_protocol():
    assert band_for(0.9) == KAPPA_BANDS[0][1]
    assert band_for(0.7) == KAPPA_BANDS[1][1]
    assert band_for(0.2) == KAPPA_BANDS[2][1]
    assert band_for(0.8) == KAPPA_BANDS[0][1], "the band edges are inclusive, as written down"


# --------------------------------------------------------------------------- pairing


def test_compare_pairs_by_label_id_and_ignores_the_rest():
    owner = [labeled("g-1", 1), labeled("g-2", 2), labeled("g-3", None)]
    blind = [labeled("g-1", 1, "zayd"), labeled("g-2", 1, "zayd"), labeled("z-9", 1, "zayd")]
    report = compare(owner, blind)
    assert report.n_pairs == 2
    assert report.n_agreed == 1
    assert report.observed == pytest.approx(0.5)
    assert report.only_owner == ("g-3",)
    assert report.only_blind == ("z-9",)


def test_a_null_truth_is_a_class_of_its_own():
    """'None of these candidates' is an answer, so two labelers can agree on it."""
    owner = [labeled("g-1", None), labeled("g-2", 1)]
    blind = [labeled("g-1", None, "zayd"), labeled("g-2", 2, "zayd")]
    report = compare(owner, blind)
    assert report.n_agreed == 1


def test_usable_follows_the_protocol_threshold():
    owner = [labeled(f"g-{i}", 1 if i % 2 else 2) for i in range(10)]
    blind = [labeled(f"g-{i}", 1 if i % 2 else 2, "zayd") for i in range(10)]
    assert compare(owner, blind).usable is True


def test_no_overlap_reports_nothing_rather_than_crashing():
    report = compare([labeled("g-1", 1)], [labeled("z-1", 1, "zayd")])
    assert report.n_pairs == 0
    assert report.observed is None
    assert report.kappa is None
    assert report.usable is False


# --------------------------------------------------------------------------- coverage gap


def test_coverage_gap_counts_the_protocols_phrase():
    labels = [
        labeled("g-1", None, notes="correct place not in candidates: Layne's"),
        labeled("g-2", None, notes="home"),
        labeled("g-3", None, notes="Correct place not in candidates: Fuego"),
        labeled("g-4", 1),
    ]
    assert coverage_gap_count(labels) == 2
    assert coverage_gap_places(labels) == ["Fuego", "Layne's"]


def test_coverage_gap_is_zero_on_a_clean_set():
    assert coverage_gap_count([labeled("g-1", 1), labeled("g-2", None, notes="parking")]) == 0


# --------------------------------------------------------------------------- CLI


def test_cli_reports_a_pair(tmp_path, capsys):
    from evaluation import agreement as agreement_cli

    owner_path = tmp_path / "george.jsonl"
    blind_path = tmp_path / "george-blind.jsonl"
    write_labels(owner_path, [labeled("g-1", 1), labeled("g-2", 2), labeled("g-3", None, notes="home")])
    write_labels(blind_path, [labeled("g-1", 1, "zayd"), labeled("g-2", 1, "zayd")])

    assert agreement_cli.main([str(owner_path), str(blind_path)]) == 0
    out = capsys.readouterr().out
    assert "3 labels" in out
    assert "2 double-labeled visit(s)" in out
    assert "Cohen's kappa" in out


def test_cli_works_without_a_blind_copy(tmp_path, capsys):
    from evaluation import agreement as agreement_cli

    owner_path = tmp_path / "george.jsonl"
    write_labels(owner_path, [labeled("g-1", None, notes="correct place not in candidates: Layne's")])
    assert agreement_cli.main([str(owner_path)]) == 0
    out = capsys.readouterr().out
    assert "OSM coverage gap: 1 label(s)" in out
    assert "missing: Layne's" in out


def test_cli_reports_a_missing_file_without_a_traceback(tmp_path, capsys):
    from evaluation import agreement as agreement_cli

    assert agreement_cli.main([str(tmp_path / "nope.jsonl")]) == 2
    assert "nope.jsonl" in capsys.readouterr().err
