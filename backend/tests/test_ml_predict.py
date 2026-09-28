"""Unit tests for the next-place predictor."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.ml.predict import predict_next_place
from app.ml.types import VisitRecord

MINUTE = 60_000
HOUR = 60 * MINUTE
DAY = 24 * HOUR

A, B, C = 101, 102, 103


def chicago_ts(year, month, day, hour, minute=0):
    return int(datetime(year, month, day, hour, minute, tzinfo=ZoneInfo("America/Chicago")).timestamp() * 1000)


def visit(place_id, start_ts, duration=30 * MINUTE, category="cafe"):
    return VisitRecord(start_ts=start_ts, end_ts=start_ts + duration, place_id=place_id, category=category)


def test_too_short_history_returns_empty():
    history = [visit(A, chicago_ts(2024, 1, i, 9)) for i in range(1, 4)]  # only 3 visits
    assert predict_next_place(history, chicago_ts(2024, 1, 5, 9)) == []


def test_strict_alternation_predicts_the_partner_place():
    # B, A, B, A, B, A -- most recent is A, and A is always followed by B.
    history = [
        visit(B, chicago_ts(2024, 1, 1, 9)),
        visit(A, chicago_ts(2024, 1, 2, 9)),
        visit(B, chicago_ts(2024, 1, 3, 9)),
        visit(A, chicago_ts(2024, 1, 4, 9)),
        visit(B, chicago_ts(2024, 1, 5, 9)),
        visit(A, chicago_ts(2024, 1, 6, 9)),
    ]
    predictions = predict_next_place(history, chicago_ts(2024, 1, 6, 12), top_k=2)
    assert predictions[0].place_id == B


def test_weekday_morning_place_outranks_weekend_only_place_at_9am_tuesday():
    history = [
        visit(A, chicago_ts(2024, 1, 2, 9)),  # Tuesday morning
        visit(A, chicago_ts(2024, 1, 9, 9)),  # Tuesday morning
        visit(A, chicago_ts(2024, 1, 16, 9)),  # Tuesday morning
        visit(B, chicago_ts(2024, 1, 6, 15)),  # Saturday afternoon
        visit(B, chicago_ts(2024, 1, 13, 15)),  # Saturday afternoon
        visit(B, chicago_ts(2024, 1, 20, 15)),  # Saturday afternoon
    ]
    at_ts = chicago_ts(2024, 1, 23, 9)  # a Tuesday, 9am
    predictions = predict_next_place(history, at_ts, top_k=2)
    assert predictions[0].place_id == A


def test_probabilities_ordered_sum_to_at_most_one_and_ranks_are_sequential():
    history = [
        visit(A, chicago_ts(2024, 1, 1, 9)),
        visit(B, chicago_ts(2024, 1, 2, 12)),
        visit(A, chicago_ts(2024, 1, 3, 9)),
        visit(C, chicago_ts(2024, 1, 4, 18)),
        visit(B, chicago_ts(2024, 1, 5, 12)),
        visit(A, chicago_ts(2024, 1, 6, 9)),
    ]
    predictions = predict_next_place(history, chicago_ts(2024, 1, 7, 9), top_k=3)
    probs = [p.probability for p in predictions]
    assert probs == sorted(probs, reverse=True)
    assert sum(probs) <= 1.0 + 1e-9
    assert [p.rank for p in predictions] == list(range(1, len(predictions) + 1))


def test_utc_timestamp_landing_on_a_different_chicago_weekday():
    # 2024-01-02 (Tuesday) 04:00 UTC is 2024-01-01 (Monday) 22:00 in Chicago.
    tuesday_early_utc = 1_704_168_000_000
    history = [
        visit(A, chicago_ts(2024, 1, 1, 22)),  # Monday night
        visit(A, chicago_ts(2023, 12, 25, 22)),
        visit(A, chicago_ts(2023, 12, 18, 22)),
        visit(B, chicago_ts(2023, 12, 26, 9)),  # a weekday morning, unrelated bucket
        visit(B, chicago_ts(2023, 12, 19, 9)),
    ]
    predictions = predict_next_place(history, tuesday_early_utc, top_k=2)
    assert predictions[0].place_id == A
