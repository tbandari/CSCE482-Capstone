"""Unit tests for the recommender; fixtures are near Texas A&M."""

from app.ml.recommend import recommend_places
from app.ml.types import InterestWeight, PlaceCandidate, VisitRecord

MINUTE = 60_000
HOUR = 60 * MINUTE
DAY = 24 * HOUR

EVANS_LIBRARY = (30.6160, -96.3393)
NORTHGATE = (30.6229, -96.3444)

T0 = 1_704_121_200_000  # 2024-01-01 14:00:00 UTC, a Monday afternoon


def offset(place, north_m, east_m):
    import math

    lat, lon = place
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def candidate(place_id, category, opening_hours="24/7", place=EVANS_LIBRARY):
    lat, lon = place
    return PlaceCandidate(place_id=place_id, name=f"place {place_id}", category=category, lat=lat, lon=lon, opening_hours=opening_hours)


def visit(place_id, category, ts, duration=30 * MINUTE):
    return VisitRecord(start_ts=ts, end_ts=ts + duration, place_id=place_id, category=category)


def interest(category, weight, hidden=False, visits=5, dwell=300.0):
    return InterestWeight(category=category, weight=weight, visits=visits, dwell_minutes=dwell, hidden=hidden)


def test_visited_place_is_never_recommended():
    interests = [interest("cafe", 1.0)]
    history = [visit(1, "cafe", T0 - DAY)]
    candidates = [candidate(1, "cafe"), candidate(2, "cafe")]
    ranked = recommend_places(interests, history, candidates, now_ts=T0)
    assert all(item.place_id != 1 for item in ranked)
    assert any(item.place_id == 2 for item in ranked)


def test_hidden_category_is_never_recommended():
    interests = [interest("cafe", 0.6), interest("bar", 0.4, hidden=True)]
    history = [visit(1, "cafe", T0 - DAY)]
    candidates = [candidate(2, "cafe"), candidate(3, "bar")]
    ranked = recommend_places(interests, history, candidates, now_ts=T0)
    assert all(item.place_id != 3 for item in ranked)


def test_strong_cafe_profile_ranks_cafe_above_unrelated_shop():
    interests = [interest("cafe", 0.8), interest("gym", 0.2)]
    history = [visit(1, "cafe", T0 - 10 * DAY), visit(2, "gym", T0 - 9 * DAY)]
    candidates = [candidate(10, "cafe"), candidate(11, "shop")]
    ranked = recommend_places(interests, history, candidates, now_ts=T0)
    ids = [item.place_id for item in ranked]
    assert ids.index(10) < ids.index(11)


def test_variety_damping_surfaces_a_non_cafe_in_all_cafe_history():
    interests = [interest("cafe", 1.0)]
    history = [visit(100 + i, "cafe", T0 - (i + 1) * DAY) for i in range(6)]
    candidates = [candidate(i, "cafe") for i in range(200, 210)] + [
        candidate(300, "park"),
        candidate(301, "museum"),
    ]
    ranked = recommend_places(interests, history, candidates, now_ts=T0, limit=5)
    categories = {c.place_id: c.category for c in candidates}
    assert any(categories[item.place_id] != "cafe" for item in ranked[:5])


def test_closed_place_ranks_below_open_place_all_else_equal():
    interests = [interest("shop", 0.5)]
    history = [visit(1, "cafe", T0 - DAY)]
    closed = candidate(10, "shop", opening_hours="off")
    open_ = candidate(11, "shop", opening_hours="24/7")
    ranked = recommend_places(interests, history, [closed, open_], now_ts=T0)
    assert [item.place_id for item in ranked] == [11, 10]


def test_scores_bounded_sorted_deterministic_with_nonempty_reasons():
    interests = [interest("cafe", 0.6), interest("gym", 0.4)]
    history = [visit(1, "cafe", T0 - 5 * DAY), visit(2, "gym", T0 - 3 * DAY)]
    candidates = [candidate(10, "cafe"), candidate(11, "gym"), candidate(12, "park"), candidate(13, "museum")]
    first = recommend_places(interests, history, candidates, now_ts=T0)
    second = recommend_places(interests, history, list(reversed(candidates)), now_ts=T0)

    assert all(0.0 <= item.score <= 1.0 for item in first)
    scores = [item.score for item in first]
    assert scores == sorted(scores, reverse=True)
    assert all(item.reason for item in first)
    assert [item.place_id for item in first] == [item.place_id for item in second]


def test_empty_candidates_interests_or_history_returns_empty():
    interests = [interest("cafe", 1.0)]
    history = [visit(1, "cafe", T0 - DAY)]
    candidates = [candidate(2, "cafe")]

    assert recommend_places([], history, candidates, now_ts=T0) == []
    assert recommend_places(interests, [], candidates, now_ts=T0) == []
    assert recommend_places(interests, history, [], now_ts=T0) == []
