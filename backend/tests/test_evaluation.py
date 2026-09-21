"""
Tests for the place-resolution evaluation harness (backend/evaluation).

The harness is what we will use to claim a number in the report, so it gets the
same scrutiny as the thing it measures: the metric math is checked against
hand-computed examples rather than against itself.
"""

from __future__ import annotations

import json
import math
import sys
import types

import pytest

from app.ml.types import PlaceCandidate, ScoredCandidate, VisitFeatures
from app.stays import haversine_m

from evaluation import make_synthetic, places as places_cli
from evaluation.baselines import NONE_EQUIVALENT_DISTANCE_M, nearest_baseline, random_baseline
from evaluation.labels import LabelError, LabeledVisit, dump_label, load_labels, parse_label, write_labels
from evaluation.metrics import NONE_PLACE_ID, evaluate, threshold_sweep

MINUTE = 60_000

LIBRARY = PlaceCandidate(1, "Evans Library", "library", 30.6160, -96.3393)
CAFE = PlaceCandidate(2, "Library Coffee Bar", "cafe", 30.61610, -96.33922)
PARKING = PlaceCandidate(3, "West Campus Parking", "parking", 30.61575, -96.33965)


def visit(lat: float = 30.6160, lon: float = -96.3393, start: int = 0, minutes: int = 90) -> VisitFeatures:
    return VisitFeatures(start_ts=start, end_ts=start + minutes * MINUTE, lat=lat, lon=lon, radius=20.0)


def labeled(
    label_id: str, truth: int | None, candidates=(LIBRARY, CAFE, PARKING), **kwargs
) -> LabeledVisit:
    return LabeledVisit(
        id=label_id, visit=visit(**kwargs), candidates=tuple(candidates), truth_place_id=truth, labeler="test"
    )


def jsonl(tmp_path, *lines: str):
    path = tmp_path / "labels.jsonl"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


VALID_LINE = json.dumps(
    {
        "id": "a-1",
        "visit": {"start_ts": 0, "end_ts": 600000, "lat": 30.616, "lon": -96.3393, "radius": 20},
        "candidates": [
            {"place_id": 1, "name": "Evans Library", "category": "library", "lat": 30.616, "lon": -96.3393}
        ],
        "truth_place_id": 1,
        "labeler": "george",
        "notes": "",
    }
)


# --------------------------------------------------------------------------- loader


def test_loads_a_valid_file_and_skips_comments(tmp_path):
    path = jsonl(tmp_path, "# a header", "", VALID_LINE)
    labels = load_labels(path)
    assert len(labels) == 1
    assert labels[0].id == "a-1"
    assert labels[0].has_truth
    assert labels[0].truth.name == "Evans Library"


def test_malformed_json_names_the_line(tmp_path):
    path = jsonl(tmp_path, VALID_LINE, "{not json", VALID_LINE.replace("a-1", "a-3"))
    with pytest.raises(LabelError) as excinfo:
        load_labels(path)
    assert excinfo.value.line_no == 2
    assert "invalid JSON" in str(excinfo.value)


def test_comments_do_not_shift_reported_line_numbers(tmp_path):
    """A header must not make the error message point at the wrong editor line."""
    path = jsonl(tmp_path, "# one", "# two", "# three", VALID_LINE, "{oops")
    with pytest.raises(LabelError) as excinfo:
        load_labels(path)
    assert excinfo.value.line_no == 5


def test_truth_must_be_among_the_candidates(tmp_path):
    bad = json.loads(VALID_LINE)
    bad["truth_place_id"] = 99
    path = jsonl(tmp_path, json.dumps(bad))
    with pytest.raises(LabelError) as excinfo:
        load_labels(path)
    assert "not among the candidates" in str(excinfo.value)
    assert excinfo.value.line_no == 1


def test_null_truth_is_allowed(tmp_path):
    row = json.loads(VALID_LINE)
    row["truth_place_id"] = None
    labels = load_labels(jsonl(tmp_path, json.dumps(row)))
    assert labels[0].has_truth is False
    assert labels[0].truth is None


def test_duplicate_ids_are_rejected_within_a_file(tmp_path):
    path = jsonl(tmp_path, VALID_LINE, VALID_LINE)
    with pytest.raises(ValueError, match="duplicate label id"):
        load_labels(path)


def test_duplicate_ids_are_rejected_across_files(tmp_path):
    first = tmp_path / "one.jsonl"
    second = tmp_path / "two.jsonl"
    first.write_text(VALID_LINE + "\n", encoding="utf-8")
    second.write_text(VALID_LINE + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate label id"):
        load_labels([first, second])


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda r: r.pop("id"), "missing required field 'id'"),
        (lambda r: r.pop("visit"), "missing required field 'visit'"),
        (lambda r: r["visit"].pop("lat"), "'visit' is missing lat"),
        (lambda r: r.update(candidates="nope"), "'candidates' must be an array"),
        (lambda r: r["candidates"][0].update(category="tavern"), "unknown category"),
        (lambda r: r["candidates"][0].update(place_id="1"), "place_id must be an integer"),
        (lambda r: r["visit"].update(lat=91), "visit.lat out of range"),
        (lambda r: r["visit"].update(end_ts=-1), "is before visit.start_ts"),
        (lambda r: r.update(id="  "), "'id' must be a non-empty string"),
    ],
)
def test_loader_rejects_bad_rows(tmp_path, mutate, expected):
    row = json.loads(VALID_LINE)
    mutate(row)
    with pytest.raises(LabelError, match=expected):
        load_labels(jsonl(tmp_path, json.dumps(row)))


def test_duplicate_candidate_ids_are_rejected(tmp_path):
    row = json.loads(VALID_LINE)
    row["candidates"].append(dict(row["candidates"][0]))
    with pytest.raises(LabelError, match="appears twice"):
        load_labels(jsonl(tmp_path, json.dumps(row)))


def test_dump_label_round_trips(tmp_path):
    original = labeled("rt-1", 1)
    reparsed = parse_label(dump_label(original), tmp_path / "x.jsonl", 1)
    assert reparsed == original


def test_write_labels_emits_a_readable_header(tmp_path):
    path = tmp_path / "out" / "labels.jsonl"
    write_labels(path, [labeled("h-1", 1)], ["SYNTHETIC", "", "second line"])
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# SYNTHETIC\n#\n# second line\n")
    assert len(load_labels(path)) == 1


# --------------------------------------------------------------------------- metrics


def perfect(_visit, candidates):
    """Always ranks the truth first -- the fixtures below all have truth place_id 1."""
    return [ScoredCandidate(c.place_id, 1.0 - i, 0.9 if c.place_id == 1 else 0.05)
            for i, c in enumerate(sorted(candidates, key=lambda c: c.place_id != 1))]


def always_abstain(_visit, candidates):
    return [ScoredCandidate(c.place_id, 0.0, 0.01) for c in candidates]


def always_wrong(_visit, candidates):
    ordered = sorted(candidates, key=lambda c: c.place_id == 1)
    return [ScoredCandidate(c.place_id, 1.0 - i, 0.9 if i == 0 else 0.05) for i, c in enumerate(ordered)]


def test_perfect_ranker_scores_one():
    labels = [labeled("p-1", 1), labeled("p-2", 1)]
    result = evaluate(perfect, labels, 0.35)
    assert result.top1 == 1.0
    assert result.top3 == 1.0
    assert result.precision == 1.0
    assert result.recall == 1.0
    assert result.abstain_rate == 0.0
    assert result.f1 == 1.0
    assert result.misses == ()


def test_always_abstain_gives_recall_zero_and_precision_none():
    labels = [labeled("a-1", 1), labeled("a-2", 1)]
    result = evaluate(always_abstain, labels, 0.35)
    assert result.n_assigned == 0
    assert result.recall == 0.0
    assert result.precision is None, "never committing is not the same as always being wrong"
    assert result.f1 is None
    assert result.abstain_rate == 1.0
    # Ranking quality is still measured: it ranked the truth first, it just never committed.
    assert result.top1 == 1.0


def test_hand_computed_mixed_case():
    """
    Four visits: three with a place, one null-truth.
      p-1 assigned correctly, p-2 assigned wrongly, p-3 abstained, n-1 assigned (on a null).

    Note top-1 (2/3) is higher than recall (1/3): p-3 ranked the truth first and
    then declined to commit. That gap between ranking and assignment is the whole
    reason the two are reported separately.
    """

    def mixed(v, candidates):
        by_start = {0: perfect, 1: always_wrong, 2: always_abstain, 3: always_wrong}
        return by_start[v.start_ts](v, candidates)

    labels = [
        labeled("p-1", 1, start=0),
        labeled("p-2", 1, start=1),
        labeled("p-3", 1, start=2),
        labeled("n-1", None, start=3),
    ]
    result = evaluate(mixed, labels, 0.35)

    assert (result.n_labeled, result.n_with_truth, result.n_null_truth) == (4, 3, 1)
    assert result.n_assigned == 3  # p-1, p-2, n-1
    assert result.n_assigned_correct == 1  # p-1
    assert result.precision == pytest.approx(1 / 3)
    assert result.recall == pytest.approx(1 / 3)
    assert result.top1 == pytest.approx(2 / 3)  # p-1 and p-3 both ranked it first
    assert result.top3 == 1.0  # truth is always somewhere in the top three
    assert result.abstain_rate == pytest.approx(1 / 4)
    assert result.correct_abstentions == 0
    assert {m.id: m.kind for m in result.misses} == {"p-2": "wrong", "p-3": "missed", "n-1": "wrong"}


def test_correct_abstention_on_null_truth_is_credited():
    result = evaluate(always_abstain, [labeled("n-1", None)], 0.35)
    assert result.correct_abstentions == 1
    assert result.misses == ()
    assert result.top1 is None, "no truth to rank, so top-1 is undefined rather than zero"


def test_in_band_none_counts_as_an_abstention():
    def says_none(_visit, candidates):
        return [ScoredCandidate(NONE_PLACE_ID, 10.0, 0.99),
                *[ScoredCandidate(c.place_id, 0.0, 0.003) for c in candidates]]

    result = evaluate(says_none, [labeled("x-1", 1)], 0.35)
    assert result.n_assigned == 0, "NONE_PLACE_ID first means abstain, whatever its confidence"
    assert result.top1 == 0.0


def test_empty_candidate_list_is_an_abstention():
    result = evaluate(nearest_baseline, [labeled("e-1", None, candidates=())], 0.35)
    assert result.n_assigned == 0
    assert result.correct_abstentions == 1


def test_per_category_breakdown():
    other = PlaceCandidate(4, "Rec", "gym", 30.6073, -96.3436)
    labels = [labeled("c-1", 1), labeled("c-2", 4, candidates=(other, CAFE))]
    result = evaluate(perfect, labels, 0.35)
    by_category = {c.category: c for c in result.per_category}
    assert by_category["library"].top1 == 1.0
    assert by_category["gym"].n == 1


def test_misses_are_sorted_by_confidence_and_can_be_capped():
    labels = [labeled(f"m-{i}", 1, start=i) for i in range(5)]
    result = evaluate(always_wrong, labels, 0.35, max_misses=2)
    assert len(result.misses) == 2
    assert result.misses[0].confidence >= result.misses[1].confidence


def test_result_as_dict_is_json_serializable():
    result = evaluate(nearest_baseline, [labeled("j-1", 1)], 0.35)
    assert json.loads(json.dumps(result.as_dict()))["ranker"] == "nearest"


# --------------------------------------------------------------------------- sweep


def test_threshold_sweep_abstain_rate_is_monotonic():
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    rows = threshold_sweep(nearest_baseline, labels)
    rates = [row.abstain_rate for row in rows]
    assert rates == sorted(rates), "raising the bar can only turn assignments into abstentions"
    assert [row.n_assigned for row in rows] == sorted((r.n_assigned for r in rows), reverse=True)


def test_threshold_sweep_is_sorted_by_threshold():
    labels = [labeled("s-1", 1)]
    rows = threshold_sweep(nearest_baseline, labels, [0.8, 0.1, 0.5])
    assert [row.threshold for row in rows] == [0.1, 0.5, 0.8]


def test_sweep_recall_is_non_increasing():
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    recalls = [row.recall for row in threshold_sweep(nearest_baseline, labels)]
    assert all(a >= b for a, b in zip(recalls, recalls[1:], strict=False))


# --------------------------------------------------------------------------- baselines


def test_nearest_baseline_ranks_by_distance():
    ranked = nearest_baseline(visit(), [PARKING, CAFE, LIBRARY])
    real = [s.place_id for s in ranked if s.place_id != NONE_PLACE_ID]
    assert real == [LIBRARY.place_id, CAFE.place_id, PARKING.place_id]


def test_nearest_baseline_confidences_sum_to_one():
    ranked = nearest_baseline(visit(), [LIBRARY, CAFE, PARKING])
    assert sum(s.confidence for s in ranked) == pytest.approx(1.0)
    assert all(0.0 <= s.confidence <= 1.0 for s in ranked)


def test_nearest_baseline_abstains_when_everything_is_far():
    far = PlaceCandidate(9, "Far shop", "shop", *make_synthetic.offset_m(30.6160, -96.3393, 48, 0))
    ranked = nearest_baseline(visit(), [far])
    assert ranked[0].place_id == NONE_PLACE_ID, "a lone candidate at the edge should lose to 'none'"


def test_nearest_baseline_is_empty_for_no_candidates():
    assert nearest_baseline(visit(), []) == []


def test_nearest_baseline_none_option_sits_at_its_equivalent_distance():
    ranked = nearest_baseline(visit(), [LIBRARY])
    none = next(s for s in ranked if s.place_id == NONE_PLACE_ID)
    assert none.score == pytest.approx(-NONE_EQUIVALENT_DISTANCE_M)


def test_baselines_are_deterministic():
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    for ranker in (nearest_baseline, random_baseline(11)):
        first = [[(s.place_id, round(s.confidence, 12)) for s in ranker(x.visit, x.candidates)] for x in labels]
        second = [[(s.place_id, round(s.confidence, 12)) for s in ranker(x.visit, x.candidates)] for x in labels]
        assert first == second


def test_random_baseline_does_not_depend_on_call_order():
    """Seeding per visit, not per run, so evaluating a subset gives the same answers."""
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    ranker = random_baseline(3)
    forward = {x.id: [s.place_id for s in ranker(x.visit, x.candidates)] for x in labels}
    backward = {x.id: [s.place_id for s in ranker(x.visit, x.candidates)] for x in reversed(labels)}
    assert forward == backward


def test_random_baseline_seeds_differ():
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    a = [[s.place_id for s in random_baseline(1)(x.visit, x.candidates)] for x in labels]
    b = [[s.place_id for s in random_baseline(2)(x.visit, x.candidates)] for x in labels]
    assert a != b


def test_nearest_beats_random_on_the_synthetic_set():
    """The floor has to be a floor, or the harness is not measuring anything."""
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    assert evaluate(nearest_baseline, labels).top1 > evaluate(random_baseline(0), labels).top1 + 0.3


# --------------------------------------------------------------------------- synthetic set


def test_generator_is_reproducible():
    assert make_synthetic.generate() == make_synthetic.generate()
    assert make_synthetic.generate(seed=1) != make_synthetic.generate(seed=2)


def test_generator_output_matches_the_committed_file():
    """If this fails, someone edited the JSONL by hand or changed the generator."""
    generated = [dump_label(label) for label in make_synthetic.generate()]
    committed = [dump_label(label) for label in load_labels(make_synthetic.DEFAULT_PATH)]
    assert generated == committed


def test_committed_set_is_well_formed():
    labels = load_labels(make_synthetic.DEFAULT_PATH)
    assert len(labels) == make_synthetic.TARGET_VISITS
    assert all(label.candidates for label in labels), "every label needs at least one candidate"
    assert all(label.visit.end_ts > label.visit.start_ts for label in labels)
    null_truth = [label for label in labels if not label.has_truth]
    assert 2 <= len(null_truth) <= 8, "roughly 10% null-truth"
    assert all(label.notes for label in null_truth), "null labels explain themselves"


def test_committed_set_keeps_the_truth_inside_the_search_radius():
    for label in load_labels(make_synthetic.DEFAULT_PATH):
        if not label.has_truth:
            continue
        distance = haversine_m(label.visit.lat, label.visit.lon, label.truth.lat, label.truth.lon)
        assert distance <= make_synthetic.SEARCH_RADIUS_M


def test_synthetic_places_are_the_demo_places():
    """Geography must match src/lib/demo/sample-week.ts, or the two demos disagree."""
    anchors = {a.name: (a.lat, a.lon) for a in make_synthetic.ANCHORS}
    assert anchors["Evans Library"] == (30.6160, -96.3393)
    assert anchors["Kyle Field"] == (30.6101, -96.3402)
    assert math.isclose(anchors["Student Rec Center"][0], 30.6073)


# --------------------------------------------------------------------------- CLI


@pytest.fixture
def ranker_absent(monkeypatch):
    """Simulate a checkout without app/ml/places.py: a None entry makes the import raise ImportError."""
    monkeypatch.setitem(sys.modules, "app.ml.places", None)


def test_cli_runs_on_the_default_set(capsys, ranker_absent):
    assert places_cli.main([]) == 0
    out = capsys.readouterr().out
    assert "Place resolution" in out
    assert "nearest" in out
    assert places_cli.RANKER_UNAVAILABLE in out


def test_cli_writes_json(tmp_path, capsys, ranker_absent):
    out_path = tmp_path / "nested" / "out.json"
    assert places_cli.main(["--json", str(out_path), "--sweep"]) == 0
    capsys.readouterr()
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["n_labeled"] == make_synthetic.TARGET_VISITS
    assert payload["rank_candidates_available"] is False
    assert {r["ranker"] for r in payload["results"]} == {"nearest", "random(seed=0)"}
    assert payload["sweeps"]["nearest"][0]["threshold"] == 0.0


def test_cli_reports_a_bad_label_file_without_a_traceback(tmp_path, capsys):
    path = jsonl(tmp_path, "{broken")
    assert places_cli.main([str(path)]) == 2
    assert "labels.jsonl:1" in capsys.readouterr().err


def test_cli_picks_up_rank_candidates_when_it_lands(monkeypatch, capsys):
    """Swap in a known ranker to prove the CLI picks up app.ml.places when it is installed."""
    module = types.ModuleType("app.ml.places")
    module.rank_candidates = perfect
    monkeypatch.setitem(__import__("sys").modules, "app.ml.places", module)

    assert places_cli.main([]) == 0
    out = capsys.readouterr().out
    assert "rank_candidates" in out
    assert places_cli.RANKER_UNAVAILABLE not in out


def test_load_rank_candidates_returns_none_when_absent(ranker_absent):
    assert places_cli.load_rank_candidates() is None
