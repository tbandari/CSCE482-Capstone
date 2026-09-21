"""Unit tests for the interest profile builder."""

from app.ml.interests import build_interest_profile
from app.ml.types import PlaceCandidate, VisitFeatures

MINUTE = 60_000
HOUR = 60 * MINUTE
DAY = 24 * HOUR

EVANS_LIBRARY = (30.6160, -96.3393)
NORTHGATE = (30.6229, -96.3444)


def visit(start_ts, duration_ms, place=EVANS_LIBRARY):
    lat, lon = place
    return VisitFeatures(start_ts=start_ts, end_ts=start_ts + duration_ms, lat=lat, lon=lon, radius=15.0)


def place(place_id, category, place_place=EVANS_LIBRARY):
    lat, lon = place_place
    return PlaceCandidate(place_id=place_id, name="p", category=category, lat=lat, lon=lon)


T0 = 1_704_121_200_000  # 2024-01-01 14:00:00 UTC


def test_empty_input_returns_empty_list():
    assert build_interest_profile([]) == []


def test_only_excluded_categories_returns_empty_list():
    visits = [(visit(T0, HOUR), place(1, "parking")), (visit(T0, HOUR), place(2, "other"))]
    assert build_interest_profile(visits) == []


def test_excluded_categories_are_dropped_but_others_remain():
    visits = [
        (visit(T0, 2 * HOUR), place(1, "library")),
        (visit(T0, HOUR), place(2, "parking")),
    ]
    profile = build_interest_profile(visits)
    categories = {w.category for w in profile}
    assert categories == {"library"}


def test_weights_sum_to_one():
    visits = [
        (visit(T0, 2 * HOUR), place(1, "library")),
        (visit(T0, HOUR), place(2, "cafe", NORTHGATE)),
        (visit(T0, 30 * MINUTE), place(3, "gym")),
    ]
    profile = build_interest_profile(visits)
    assert abs(sum(w.weight for w in profile) - 1.0) < 1e-9
    assert profile == sorted(profile, key=lambda w: -w.weight)


def test_recent_visits_outweigh_old_ones_of_equal_dwell():
    now = T0 + 200 * DAY
    old = visit(T0, HOUR)  # 200 days before now_ts
    recent = visit(now - HOUR, HOUR)
    visits = [(old, place(1, "cafe")), (recent, place(2, "library"))]
    profile = build_interest_profile(visits, now_ts=now, half_life_days=60.0)
    by_category = {w.category: w for w in profile}
    assert by_category["library"].weight > by_category["cafe"].weight


def test_hidden_categories_have_zero_weight_and_sort_last():
    visits = [
        (visit(T0, 3 * HOUR), place(1, "library")),
        (visit(T0, HOUR), place(2, "cafe", NORTHGATE)),
    ]
    profile = build_interest_profile(visits, hidden=["library"])
    by_category = {w.category: w for w in profile}
    assert by_category["library"].hidden is True
    assert by_category["library"].weight == 0.0
    assert abs(by_category["cafe"].weight - 1.0) < 1e-9
    assert profile[-1].category == "library"


def test_raw_visits_and_dwell_minutes_are_not_decayed():
    visits = [
        (visit(T0, HOUR), place(1, "cafe")),
        (visit(T0 + DAY, HOUR), place(1, "cafe")),
    ]
    profile = build_interest_profile(visits)
    cafe = profile[0]
    assert cafe.visits == 2
    assert abs(cafe.dwell_minutes - 120.0) < 1e-9
