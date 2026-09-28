"""
Tests for the next-place prediction harness.

Top-1 and top-3 accuracy are the proposal's metric for this model, so the walk
forward gets the same scrutiny as the metric: a predictor must never be handed a
visit at or after the one it is predicting.
"""

from __future__ import annotations

import json
import sys
import types

import pytest

from evaluation import make_synthetic_history, predict as predict_cli
from evaluation.baselines import most_frequent_place_baseline
from evaluation.contract import NextPlace, VisitRecord
from evaluation.history import load_history
from evaluation.predict import (
    MIN_HISTORY,
    day_type,
    evaluate_predictor,
    time_of_day,
    walk_forward,
)

HOUR = 3_600_000
DAY = 24 * HOUR

#: Monday 2026-09-21 09:00 America/Chicago (CDT, UTC-5).
MONDAY_9AM = 1_789_999_200_000


def rec(place_id: int, day: int, hour: float = 9.0, minutes: int = 60) -> VisitRecord:
    start = MONDAY_9AM + day * DAY + int((hour - 9.0) * HOUR)
    return VisitRecord(start_ts=start, end_ts=start + minutes * 60_000, place_id=place_id, category="cafe")


def alternating(history, at_ts, top_k=3):
    """Knows the A/B/A/B pattern: predict whichever place is not the last one."""
    seen = sorted({v.place_id for v in history})
    if len(seen) != 2 or not history:
        return []
    other = seen[0] if history[-1].place_id == seen[1] else seen[1]
    order = [other, history[-1].place_id][:top_k]
    return [NextPlace(place_id=p, probability=0.9 if i == 0 else 0.1, rank=i + 1) for i, p in enumerate(order)]


def oracle(visits):
    """A predictor that always names the actual next place, keyed by the moment asked."""
    truth = {v.start_ts: v.place_id for v in visits}

    def predict(history, at_ts, top_k=3):
        return [NextPlace(place_id=truth[at_ts], probability=1.0, rank=1)]

    return predict


def silent(history, at_ts, top_k=3):
    return []


# --------------------------------------------------------------------------- the walk


def test_walk_forward_skips_the_warm_up_and_predicts_every_later_visit():
    visits = [rec(1, day) for day in range(10)]
    steps = list(walk_forward(visits, min_history=5))
    assert len(steps) == 5
    assert [target.start_ts for _, target in steps] == [v.start_ts for v in visits[5:]]


def test_walk_forward_never_shows_the_predictor_the_visit_it_is_predicting():
    """The one leak that would make every number here meaningless."""
    visits = [rec(place_id, day) for day, place_id in enumerate([1, 2, 1, 2, 3, 1, 2, 3], start=0)]
    for past, target in walk_forward(visits, min_history=3):
        assert all(v.start_ts < target.start_ts for v in past)
        assert all(v.end_ts <= target.start_ts for v in past)
        assert target not in past


def test_walk_forward_yields_nothing_for_a_short_history():
    assert list(walk_forward([rec(1, 0), rec(2, 1)], min_history=5)) == []


# --------------------------------------------------------------------------- metrics


def test_a_strict_alternating_history_is_predicted_perfectly():
    """A→B→A→B is learnable, so a predictor that learns it must score 1.0."""
    visits = [rec(1 if day % 2 == 0 else 2, day) for day in range(20)]
    result = evaluate_predictor(alternating, visits, min_history=MIN_HISTORY)
    assert result.n == 15
    assert result.top1 == 1.0
    assert result.top3 == 1.0


def test_the_frequency_baseline_on_an_alternating_history_is_hand_computable():
    """
    A→B→A→B, ties broken by place id, so it always answers [A, B].

    It is therefore right exactly when the next visit is A -- half the time --
    and its top-3 is perfect, because there are only two places to name.
    """
    visits = [rec(1 if day % 2 == 0 else 2, day) for day in range(20)]
    result = evaluate_predictor(most_frequent_place_baseline, visits, min_history=5)
    assert result.n == 15
    assert result.top1 == pytest.approx(7 / 15)
    assert result.top3 == 1.0


def test_an_oracle_scores_one_and_a_silent_predictor_scores_zero():
    visits = [rec(day % 4 + 1, day) for day in range(12)]
    assert evaluate_predictor(oracle(visits), visits).top1 == 1.0
    empty = evaluate_predictor(silent, visits)
    assert empty.top1 == 0.0
    assert empty.top3 == 0.0
    assert empty.n_empty == empty.n


def test_only_the_first_prediction_counts_for_top_one():
    def second_best(history, at_ts, top_k=3):
        return [NextPlace(99, 0.5, 1), NextPlace(1, 0.4, 2)]

    visits = [rec(1, day) for day in range(10)]
    result = evaluate_predictor(second_best, visits)
    assert result.top1 == 0.0
    assert result.top3 == 1.0


def test_extra_predictions_beyond_top_k_are_ignored():
    def too_many(history, at_ts, top_k=3):
        return [NextPlace(9, 0.2, 1), NextPlace(8, 0.2, 2), NextPlace(7, 0.2, 3), NextPlace(1, 0.2, 4)]

    visits = [rec(1, day) for day in range(10)]
    assert evaluate_predictor(too_many, visits, top_k=3).top3 == 0.0


def test_no_scorable_visits_gives_none_rather_than_zero():
    result = evaluate_predictor(most_frequent_place_baseline, [rec(1, 0)], min_history=5)
    assert result.n == 0
    assert result.top1 is None and result.top3 is None


def test_result_as_dict_is_json_serializable():
    visits = [rec(1, day) for day in range(10)]
    payload = json.loads(json.dumps(evaluate_predictor(alternating, visits, name="x").as_dict()))
    assert payload["predictor"] == "x"


# --------------------------------------------------------------------------- slices


def test_time_of_day_and_day_type_are_local_not_utc():
    """9pm in College Station is 2am UTC the next day; the slice must say evening."""
    nine_pm_friday = MONDAY_9AM + 4 * DAY + 12 * HOUR
    assert time_of_day(nine_pm_friday) == "evening"
    assert day_type(nine_pm_friday) == "weekday"
    assert day_type(nine_pm_friday + DAY) == "weekend"


def test_time_of_day_buckets():
    assert time_of_day(MONDAY_9AM - 6 * HOUR) == "night"  # 03:00
    assert time_of_day(MONDAY_9AM) == "morning"
    assert time_of_day(MONDAY_9AM + 5 * HOUR) == "afternoon"
    assert time_of_day(MONDAY_9AM + 9 * HOUR) == "evening"


def test_slices_partition_the_predictions():
    visits = [rec(day % 3 + 1, day, hour=8.0 + 4 * (day % 3)) for day in range(24)]
    result = evaluate_predictor(most_frequent_place_baseline, visits)
    assert sum(s.n for s in result.by_time_of_day) == result.n
    assert sum(s.n for s in result.by_day_type) == result.n
    assert [s.name for s in result.by_day_type] == ["weekday", "weekend"]


def test_slices_come_back_in_a_readable_order():
    visits = [rec(1, day, hour=[3.0, 9.0, 14.0, 20.0][day % 4]) for day in range(20)]
    result = evaluate_predictor(alternating, visits)
    assert [s.name for s in result.by_time_of_day] == ["night", "morning", "afternoon", "evening"]


# --------------------------------------------------------------------------- contract checks


def test_the_baseline_probabilities_sum_to_at_most_one():
    visits = [rec(day % 3 + 1, day) for day in range(12)]
    for past, target in walk_forward(visits):
        predictions = most_frequent_place_baseline(past, target.start_ts, top_k=3)
        assert sum(p.probability for p in predictions) <= 1.0 + 1e-9
        assert [p.rank for p in predictions] == list(range(1, len(predictions) + 1))


def test_a_broken_contract_is_counted_not_hidden():
    def bad(history, at_ts, top_k=3):
        return [NextPlace(1, 0.8, 1), NextPlace(2, 0.8, 2)]

    visits = [rec(1, day) for day in range(10)]
    result = evaluate_predictor(bad, visits)
    assert result.contract_violations == result.n


def test_out_of_order_ranks_are_a_violation():
    def bad(history, at_ts, top_k=3):
        return [NextPlace(1, 0.4, 2), NextPlace(2, 0.1, 1)]

    visits = [rec(1, day) for day in range(10)]
    result = evaluate_predictor(bad, visits)
    assert result.contract_violations == result.n


def test_the_baseline_declines_on_an_empty_history():
    assert most_frequent_place_baseline([], 0) == []


# --------------------------------------------------------------------------- the committed history


def test_the_synthetic_student_is_long_enough_to_score():
    visits = load_history(make_synthetic_history.PRIMARY).visits
    assert len(list(walk_forward(visits))) > 100


def test_the_baseline_beats_chance_on_the_synthetic_student():
    """If 'wherever you go most' is no better than nothing, the fixture has no routine in it."""
    visits = load_history(make_synthetic_history.PRIMARY).visits
    result = evaluate_predictor(most_frequent_place_baseline, visits)
    assert result.top1 > 0.05
    assert result.top3 > result.top1


# --------------------------------------------------------------------------- CLI


@pytest.fixture
def predictor_absent(monkeypatch):
    """Simulate a checkout without app/ml/predict.py: a None entry makes the import raise."""
    monkeypatch.setitem(sys.modules, "app.ml.predict", None)


def test_load_predict_next_place_returns_none_when_absent(predictor_absent):
    assert predict_cli.load_predict_next_place() is None


def test_cli_runs_on_the_committed_history(capsys, predictor_absent):
    assert predict_cli.main([]) == 0
    out = capsys.readouterr().out
    assert "Next-place prediction" in out
    assert "most_frequent" in out
    assert predict_cli.PREDICTOR_UNAVAILABLE in out
    assert "weekend" in out


def test_cli_writes_json(tmp_path, capsys, predictor_absent):
    out_path = tmp_path / "nested" / "out.json"
    assert predict_cli.main(["--json", str(out_path)]) == 0
    capsys.readouterr()
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["predict_next_place_available"] is False
    assert payload["results"][0]["predictor"] == "most_frequent"
    assert payload["results"][0]["by_day_type"]


def test_cli_reports_a_missing_file_without_a_traceback(capsys):
    assert predict_cli.main(["evaluation/data/history/nobody.json"]) == 2
    assert "nobody.json" in capsys.readouterr().err


def test_cli_refuses_a_history_shorter_than_the_warm_up(tmp_path, capsys):
    path = tmp_path / "short.json"
    path.write_text(
        json.dumps({"places": [], "visits": [
            {"start_ts": 0, "end_ts": 1, "place_id": 1, "category": "cafe"}
        ]}),
        encoding="utf-8",
    )
    assert predict_cli.main([str(path)]) == 2
    assert "need more than" in capsys.readouterr().err


def test_cli_picks_up_predict_next_place_when_it_lands(monkeypatch, capsys):
    """Swap in a known predictor to prove the CLI finds app.ml.predict once installed."""
    module = types.ModuleType("app.ml.predict")
    module.predict_next_place = alternating
    monkeypatch.setitem(sys.modules, "app.ml.predict", module)

    assert predict_cli.main([]) == 0
    out = capsys.readouterr().out
    assert "predict_next_place" in out
    assert predict_cli.PREDICTOR_UNAVAILABLE not in out
