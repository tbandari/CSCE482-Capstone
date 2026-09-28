"""
Tests for the recommender evaluation harness.

The harness is what we will use to claim the iteration's exit criterion -- that
`recommend_places` beats a popularity baseline on held-out months -- so the
metric math is checked against hand-computed examples rather than against
itself, and the temporal split is checked for leaks in both directions.
"""

from __future__ import annotations

import json
import sys
import types

import pytest

from app.ml.types import PlaceCandidate

from evaluation import make_synthetic_history, recommend as recommend_cli
from evaluation.baselines import personal_frequency_baseline, popularity_baseline, random_recommender
from evaluation.contract import ScoredPlace, VisitRecord
from evaluation.history import History, HistoryError, dump_history, load_history, parse_history, write_history
from evaluation.metrics_recommend import (
    HoldoutCase,
    build_case,
    cutoff_for_last_weeks,
    evaluate_recommender,
    profile_from_history,
    split_history,
)

HOUR = 3_600_000
DAY = 24 * HOUR
#: The cutoff every hand-built case below is split at: the morning of day 10.
CUT = 10 * DAY

CATALOG = (
    PlaceCandidate(1, "Evans Library", "library", 30.6160, -96.3393),
    PlaceCandidate(2, "Northgate Coffee", "cafe", 30.6222, -96.3465),
    PlaceCandidate(3, "Sweet Eugene's", "cafe", 30.6187, -96.3399),
    PlaceCandidate(4, "Student Rec Center", "gym", 30.6073, -96.3436),
    PlaceCandidate(5, "Wolf Pen Creek Park", "park", 30.6197, -96.3055),
)
CATEGORY = {c.place_id: c.category for c in CATALOG}


def rec(place_id: int, day: int, minutes: int = 60, hour: float = 9.0) -> VisitRecord:
    """One visit on `day`, at a readable hour, so fixtures never overlap by accident."""
    start = day * DAY + int(hour * HOUR)
    return VisitRecord(
        start_ts=start,
        end_ts=start + minutes * 60_000,
        place_id=place_id,
        category=CATEGORY.get(place_id, "other"),
    )


def history(*visits: VisitRecord, places=CATALOG, meta=None) -> History:
    return History(visits=tuple(visits), places=tuple(places), meta=meta or {})


def case(train, test, *, places=CATALOG, cutoff=CUT) -> HoldoutCase:
    """A case built by hand, so a metric test does not depend on the profile model."""
    return HoldoutCase(
        user="t", cutoff_ts=cutoff, train=tuple(train), test=tuple(test), candidates=tuple(places), interests=()
    )


def fixed(*place_ids: int):
    """A recommender that always answers with this list."""

    def recommend(interests, hist, candidates, now_ts, limit=20, tz="America/Chicago"):
        return [ScoredPlace(p, 1.0 - i / 100, "fixed") for i, p in enumerate(place_ids)][:limit]

    return recommend


# --------------------------------------------------------------------------- the split


def test_split_puts_each_visit_on_exactly_one_side():
    visits = [rec(1, 0), rec(2, 5), rec(3, 20)]
    train, test = split_history(visits, CUT)
    assert [v.place_id for v in train] == [1, 2]
    assert [v.place_id for v in test] == [3]


def test_split_never_leaks_a_test_visit_into_training():
    """Every training visit must have finished before the cutoff. No exceptions."""
    visits = [rec(1, i, minutes=90) for i in range(30)]
    cutoff = CUT + 3 * HOUR
    train, test = split_history(visits, cutoff)
    assert all(v.end_ts <= cutoff for v in train)
    assert all(v.start_ts >= cutoff for v in test)
    assert not ({id(v) for v in train} & {id(v) for v in test})
    assert len(train) + len(test) <= len(visits)


def test_a_visit_straddling_the_cutoff_goes_to_neither_side():
    straddler = VisitRecord(start_ts=CUT - HOUR, end_ts=CUT + HOUR, place_id=1, category="library")
    train, test = split_history([rec(2, 0), straddler, rec(3, 20)], CUT)
    assert [v.place_id for v in train] == [2]
    assert [v.place_id for v in test] == [3]


def test_build_case_counts_the_dropped_straddler():
    straddler = VisitRecord(start_ts=CUT - HOUR, end_ts=CUT + HOUR, place_id=1, category="library")
    built = build_case(history(rec(2, 0), straddler, rec(3, 20)), CUT)
    assert built.dropped == 1


def test_cutoff_for_last_weeks():
    visits = [rec(1, 0), rec(2, 40)]
    assert cutoff_for_last_weeks(visits, 1) == visits[-1].end_ts - 7 * DAY
    assert cutoff_for_last_weeks([], 3) == 0


def test_truth_sets_separate_new_places_from_revisits():
    built = case(train=[rec(1, 0), rec(2, 1)], test=[rec(1, 20), rec(3, 30), rec(3, 40)])
    assert built.truth_all == (1, 3), "distinct, in first-visit order"
    assert built.truth_new == (3,), "place 1 was already in training"


def test_profile_is_built_from_training_only():
    """The whole protocol rests on this: the profile must not see the future."""
    built = build_case(history(rec(1, 0), rec(4, 20)), CUT)
    categories = {w.category for w in built.interests}
    assert categories == {"library"}, "the gym visit is in the held-out half"


def test_profile_counts_a_visit_to_a_place_outside_the_catalog():
    """Its category is on the VisitRecord, so a coverage gap still shapes the profile."""
    profile = profile_from_history([VisitRecord(0, HOUR, 901, "cafe")], {}, now_ts=HOUR)
    assert [w.category for w in profile] == ["cafe"]


# --------------------------------------------------------------------------- metrics


def test_hand_computed_hit_rate_and_mrr():
    """
    Truth is places 3 and 4. The recommender answers [3, 5, 4].

      place 3 -> rank 1, place 4 -> rank 3, place 5 is noise.
      hit@1 = 1/2, hit@2 = 1/2, hit@3 = 2/2
      MRR   = (1/1 + 1/3) / 2 = 2/3
    """
    built = case(train=[rec(1, 0)], test=[rec(3, 20), rec(4, 30)])
    result = evaluate_recommender(fixed(3, 5, 4), [built], ks=(1, 2, 3))

    assert result.new_places.n == 2
    assert result.new_places.at(1) == pytest.approx(0.5)
    assert result.new_places.at(2) == pytest.approx(0.5)
    assert result.new_places.at(3) == pytest.approx(1.0)
    assert result.new_places.mrr == pytest.approx(2 / 3)


def test_hand_computed_coverage():
    """Coverage counts what it ever suggests, not what it got right."""
    built = case(train=[rec(1, 0)], test=[rec(3, 20)])
    result = evaluate_recommender(fixed(3, 5, 4), [built], ks=(3,))
    assert (result.coverage.places, result.coverage.catalog_places) == (3, 5)
    # places 3 (cafe), 5 (park), 4 (gym)
    assert (result.coverage.categories, result.coverage.catalog_categories) == (3, 4)
    assert result.coverage.place_share == pytest.approx(0.6)


def test_a_recommender_that_always_names_the_same_places_has_low_coverage():
    """The failure mode the coverage column exists to expose."""
    cases = [
        case(train=[rec(1, 0)], test=[rec(3, 20)]),
        case(train=[rec(4, 0)], test=[rec(5, 20)]),
    ]
    narrow = evaluate_recommender(fixed(2, 3), cases, ks=(2,), name="narrow")
    wide = evaluate_recommender(fixed(2, 3, 5, 1), cases, ks=(4,), name="wide")
    assert narrow.coverage.places == 2
    assert wide.coverage.places == 4
    assert narrow.new_places.at(2) == pytest.approx(0.5), "still scores on half the truth"


def test_a_perfect_recommender_scores_one():
    def perfect(interests, hist, candidates, now_ts, limit=20, tz="America/Chicago"):
        seen = {v.place_id for v in hist}
        return [ScoredPlace(c.place_id, 1.0, "oracle") for c in candidates if c.place_id not in seen][:limit]

    built = case(train=[rec(1, 0)], test=[rec(2, 20), rec(3, 30)])
    result = evaluate_recommender(perfect, [built], ks=(5,))
    assert result.new_places.at(5) == 1.0
    assert result.history_leaks == 0


def test_unreachable_truth_is_a_miss_and_is_counted_separately():
    """A place missing from the catalog is an OSM gap, not a model failure."""
    built = case(train=[rec(1, 0)], test=[rec(3, 20), VisitRecord(30 * DAY, 30 * DAY + HOUR, 901, "cafe")])
    result = evaluate_recommender(fixed(3, 5), [built], ks=(2,))
    assert result.new_places.n == 2
    assert result.new_places.unreachable == 1
    assert result.new_places.reachable == 1
    assert result.new_places.at(2) == pytest.approx(0.5), "the unreachable place stays in the denominator"


def test_response_is_truncated_to_the_limit():
    """Ignoring `limit` must not buy hit-rate with length."""
    built = case(train=[], test=[rec(5, 20)])
    result = evaluate_recommender(fixed(1, 2, 3, 4, 5), [built], ks=(3,), limit=3)
    assert result.new_places.at(3) == 0.0


def test_a_repeated_place_does_not_earn_a_second_slot():
    built = case(train=[], test=[rec(2, 20)])
    result = evaluate_recommender(fixed(1, 1, 1, 2), [built], ks=(2,), limit=2)
    assert result.new_places.at(2) == 0.0, "place 2 sits at rank 4 once the repeats collapse"


def test_history_leaks_are_counted():
    built = case(train=[rec(1, 0), rec(2, 1)], test=[rec(3, 20)])
    result = evaluate_recommender(fixed(1, 2, 3), [built], ks=(3,))
    assert result.history_leaks == 2, "recommending somewhere they already go breaks the contract"


def test_empty_responses_are_counted():
    result = evaluate_recommender(fixed(), [case(train=[], test=[rec(1, 20)])], ks=(1,))
    assert result.empty_responses == 1
    assert result.new_places.at(1) == 0.0


def test_no_truth_scores_zero_rather_than_dividing_by_zero():
    result = evaluate_recommender(fixed(1), [case(train=[rec(1, 0)], test=[])], ks=(1,))
    assert result.new_places.n == 0
    assert result.new_places.at(1) == 0.0
    assert result.new_places.mrr == 0.0


def test_result_as_dict_is_json_serializable():
    result = evaluate_recommender(fixed(3), [case(train=[], test=[rec(3, 20)])], ks=(1,), name="x")
    assert json.loads(json.dumps(result.as_dict()))["new_places"]["hit_rate"]["1"] == 1.0


# --------------------------------------------------------------------------- baselines


def test_popularity_ranks_by_corpus_counts_and_skips_the_users_own_places():
    corpus = [rec(5, 0), rec(5, 1), rec(5, 2), rec(3, 3), rec(3, 4), rec(2, 5)]
    ranked = popularity_baseline(corpus)((), [rec(5, 0)], CATALOG, CUT, limit=5)
    assert [s.place_id for s in ranked] == [3, 2], "place 5 is popular, but they have been"
    assert ranked[0].score == 1.0 and ranked[1].score == pytest.approx(0.5)
    assert "popular" in ranked[0].reason


def test_popularity_can_be_asked_not_to_exclude_history():
    corpus = [rec(5, 0), rec(3, 1)]
    ranked = popularity_baseline(corpus, exclude_history=False)((), [rec(5, 0)], CATALOG, CUT, limit=5)
    assert [s.place_id for s in ranked] == [3, 5]


def test_personal_frequency_only_ever_re_suggests_known_places():
    """Documented as unfair: it wins on revisits and scores zero on discovery."""
    built = case(train=[rec(1, 0), rec(1, 1), rec(2, 2)], test=[rec(1, 20), rec(3, 30)])
    result = evaluate_recommender(personal_frequency_baseline, [built], ks=(5,))
    assert result.new_places.at(5) == 0.0, "place 3 is new, so it can never find it"
    assert result.all_places.at(5) == pytest.approx(0.5), "but it nails the revisit"


def test_random_recommender_is_near_the_floor_on_the_synthetic_cohort():
    cases = recommend_cli.build_cases(recommend_cli.default_sources())
    corpus = [v for c in cases for v in c.train]
    popularity = evaluate_recommender(popularity_baseline(corpus), cases, name="popularity")
    floor = evaluate_recommender(random_recommender(0), cases, name="random")
    assert floor.new_places.at(10) < popularity.new_places.at(10)
    assert floor.new_places.at(10) < 0.10, "a floor that is not a floor measures nothing"


def test_random_recommender_never_suggests_a_place_from_history():
    ranked = random_recommender(3)((), [rec(1, 0), rec(2, 1)], CATALOG, CUT, limit=5)
    assert {s.place_id for s in ranked}.isdisjoint({1, 2})


def test_recommendation_baselines_are_deterministic():
    corpus = [rec(3, 0), rec(5, 1)]
    for baseline in (popularity_baseline(corpus), personal_frequency_baseline, random_recommender(7)):
        first = [s.place_id for s in baseline((), [rec(1, 0)], CATALOG, CUT, limit=5)]
        second = [s.place_id for s in baseline((), [rec(1, 0)], CATALOG, CUT, limit=5)]
        assert first == second


# --------------------------------------------------------------------------- history files


def test_history_round_trips():
    original = history(rec(1, 0), rec(2, 1), meta={"synthetic": True})
    assert parse_history(json.loads(dump_history(original))) == original


def test_history_rejects_an_unsorted_file():
    with pytest.raises(HistoryError, match="sorted oldest first"):
        parse_history({"places": [], "visits": [
            {"start_ts": 100, "end_ts": 200, "place_id": 1, "category": "cafe"},
            {"start_ts": 0, "end_ts": 50, "place_id": 1, "category": "cafe"},
        ]})


def test_history_names_the_field_that_is_wrong():
    with pytest.raises(HistoryError) as excinfo:
        parse_history({"places": [], "visits": [{"start_ts": 0, "end_ts": 1, "place_id": 1, "category": "nope"}]})
    assert "visits[0]" in str(excinfo.value)
    assert "unknown category" in str(excinfo.value)


def test_history_rejects_an_end_before_its_start():
    with pytest.raises(HistoryError, match="is before start_ts"):
        parse_history({"places": [], "visits": [
            {"start_ts": 100, "end_ts": 50, "place_id": 1, "category": "cafe"}
        ]})


def test_an_export_dump_is_read_directly():
    """Nobody should have to hand-convert their own export to run the harness."""
    export = {
        "exported_at": 0,
        "visits": [
            {"start_ts": 0, "end_ts": HOUR, "place": {"id": 1, "name": "Evans Library",
                                                      "category": "library", "lat": 30.616, "lon": -96.3393}},
            {"start_ts": DAY, "end_ts": DAY + HOUR, "place": None},
        ],
    }
    parsed = parse_history(export)
    assert [v.place_id for v in parsed.visits] == [1]
    assert parsed.meta["unresolved_visits_dropped"] == 1
    assert parsed.places[0].name == "Evans Library"


def test_load_history_reports_a_missing_file():
    with pytest.raises(FileNotFoundError):
        load_history("evaluation/data/history/nobody.json")


def test_write_and_load_history_round_trip(tmp_path):
    original = history(rec(1, 0), meta={"synthetic": True})
    path = tmp_path / "nested" / "h.json"
    write_history(path, original)
    assert load_history(path) == original


# --------------------------------------------------------------------------- the synthetic cohort


def test_generator_is_reproducible():
    assert make_synthetic_history.generate_all() == make_synthetic_history.generate_all()
    assert make_synthetic_history.generate_all(1) != make_synthetic_history.generate_all(2)


def test_generator_output_matches_the_committed_files():
    """If this fails, someone edited the JSON by hand or changed the generator."""
    for key, generated in make_synthetic_history.generate_all().items():
        committed = load_history(make_synthetic_history.DEFAULT_DIR / f"{key}.json")
        assert dump_history(generated) == dump_history(committed), key


def test_committed_histories_are_well_formed():
    for path in recommend_cli.default_sources():
        loaded = load_history(path)
        assert loaded.meta["synthetic"] is True
        assert "SYNTHETIC" in loaded.meta["warning"]
        assert len(loaded.visits) > 50
        assert all(v.end_ts > v.start_ts for v in loaded.visits)
        starts = [v.start_ts for v in loaded.visits]
        assert starts == sorted(starts)


def test_committed_visits_never_overlap():
    """Stay detection cannot produce overlapping visits, so the fixture must not either."""
    for path in recommend_cli.default_sources():
        visits = load_history(path).visits
        assert all(a.end_ts <= b.start_ts for a, b in zip(visits, visits[1:], strict=False))


def test_the_student_changes_behaviour_exactly_at_the_cutoff():
    """The fixture's whole point: new places that only a generalising model can find."""
    loaded = load_history(make_synthetic_history.PRIMARY)
    cutoff = loaded.meta["holdout_cutoff_ts"]
    before = {v.place_id for v in loaded.visits if v.end_ts <= cutoff}
    after = {v.place_id for v in loaded.visits if v.start_ts >= cutoff}
    new_gym = make_synthetic_history.PLACE_IDS["Aggie Strength Club"]
    old_gym = make_synthetic_history.PLACE_IDS["Student Rec Center"]
    assert new_gym in after - before, "the new gym has to be new"
    assert old_gym in before and old_gym not in after, "and the old one has to stop"
    assert len(after - before) >= 4, "enough held-out discoveries to measure"


def test_some_held_out_visits_are_unreachable_by_design():
    loaded = load_history(make_synthetic_history.PRIMARY)
    catalog = set(loaded.catalog)
    assert loaded.meta["osm_gap_place_ids"]
    assert all(place_id not in catalog for place_id in loaded.meta["osm_gap_place_ids"])


def test_the_catalog_is_big_enough_for_top_20_to_mean_something():
    loaded = load_history(make_synthetic_history.PRIMARY)
    assert len(loaded.places) >= 150, "with a small catalog even random scores well at k=20"


def test_the_cohort_gives_the_popularity_baseline_something_to_say():
    """With one history, 'popular' and 'places this user goes' are the same list."""
    cases = recommend_cli.build_cases(recommend_cli.default_sources())
    assert len(cases) >= 5
    corpus = [v for c in cases for v in c.train]
    student = next(c for c in cases if c.user == "student")
    ranked = popularity_baseline(corpus)((), student.train, student.candidates, student.cutoff_ts, limit=20)
    assert ranked, "the baseline must be able to name somewhere the student has not been"


# --------------------------------------------------------------------------- CLI


@pytest.fixture
def recommender_absent(monkeypatch):
    """Simulate a checkout without app/ml/recommend.py: a None entry makes the import raise."""
    monkeypatch.setitem(sys.modules, "app.ml.recommend", None)


def test_load_recommend_places_returns_none_when_absent(recommender_absent):
    assert recommend_cli.load_recommend_places() is None


def test_cli_runs_on_the_committed_cohort(capsys, recommender_absent):
    assert recommend_cli.main([]) == 0
    out = capsys.readouterr().out
    assert "Recommendation · temporal hold-out" in out
    assert "popularity" in out
    assert recommend_cli.RECOMMENDER_UNAVAILABLE in out
    assert "VERDICT" in out


def test_cli_can_score_one_user(capsys, recommender_absent):
    assert recommend_cli.main(["--user", "student"]) == 0
    assert "1 case(s): student" in capsys.readouterr().out


def test_cli_writes_json(tmp_path, capsys, recommender_absent):
    out_path = tmp_path / "nested" / "out.json"
    assert recommend_cli.main(["--json", str(out_path)]) == 0
    capsys.readouterr()
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["recommend_places_available"] is False
    assert {r["recommender"] for r in payload["results"]} >= {"popularity", "personal_frequency"}
    assert payload["verdict"].startswith("VERDICT")


def test_cli_reports_a_bad_history_file_without_a_traceback(tmp_path, capsys):
    path = tmp_path / "broken.json"
    path.write_text("{not json", encoding="utf-8")
    assert recommend_cli.main([str(path)]) == 2
    assert "broken.json" in capsys.readouterr().err


def test_cli_picks_up_recommend_places_when_it_lands(monkeypatch, capsys):
    """Swap in a known recommender to prove the CLI finds app.ml.recommend once installed."""
    module = types.ModuleType("app.ml.recommend")
    module.recommend_places = fixed(1, 2, 3)
    monkeypatch.setitem(sys.modules, "app.ml.recommend", module)

    assert recommend_cli.main(["--user", "student"]) == 0
    out = capsys.readouterr().out
    assert "recommend_places" in out
    assert recommend_cli.RECOMMENDER_UNAVAILABLE not in out
    assert "CLEARS" in out or "does NOT clear" in out


def test_verdict_reads_the_margin_off_the_new_place_column():
    built = case(train=[rec(1, 0)], test=[rec(3, 20), rec(4, 30)])
    good = evaluate_recommender(fixed(3, 4), [built], name="recommend_places")
    bad = evaluate_recommender(fixed(5), [built], name="recommend_places")
    bar = evaluate_recommender(fixed(3), [built], name="popularity")

    clears = recommend_cli.verdict([good, bar], k=10)
    assert "CLEARS" in clears and "+50.0 points" in clears
    assert "does NOT clear" in recommend_cli.verdict([bad, bar], k=10)


def test_verdict_says_so_when_the_model_is_missing():
    built = case(train=[rec(1, 0)], test=[rec(3, 20)])
    bar = evaluate_recommender(fixed(5), [built], name="popularity")
    assert "not installed yet" in recommend_cli.verdict([bar])
