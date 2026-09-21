"""Unit tests for the candidate ranker; fixtures are near Texas A&M."""

from app.ml.places import rank_candidates
from app.ml.types import PlaceCandidate, VisitFeatures

MINUTE = 60_000
HOUR = 60 * MINUTE

EVANS_LIBRARY = (30.6160, -96.3393)


def offset(place, north_m, east_m):
    import math

    lat, lon = place
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def visit(start_ts, duration_ms, place=EVANS_LIBRARY, radius=20.0):
    lat, lon = place
    return VisitFeatures(start_ts=start_ts, end_ts=start_ts + duration_ms, lat=lat, lon=lon, radius=radius)


def candidate(place_id, lat, lon, category="shop", name="place", opening_hours=None):
    return PlaceCandidate(place_id=place_id, name=name, category=category, lat=lat, lon=lon, opening_hours=opening_hours)


# A Monday 14:00 UTC start, matching a Monday afternoon in Chicago too (no DST edge).
MONDAY_1400_UTC = 1_704_121_200_000  # 2024-01-01 14:00:00 UTC


def test_empty_candidates_returns_empty_list():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    assert rank_candidates(v, []) == []


def test_nearer_beats_farther_all_else_equal():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    near_lat, near_lon = offset(EVANS_LIBRARY, 5, 0)
    far_lat, far_lon = offset(EVANS_LIBRARY, 40, 0)
    near = candidate(1, near_lat, near_lon)
    far = candidate(2, far_lat, far_lon)
    ranked = rank_candidates(v, [far, near])
    assert [c.place_id for c in ranked] == [1, 2]
    assert ranked[0].score > ranked[1].score


def test_long_visit_prefers_library_over_cafe_at_same_distance():
    v = visit(MONDAY_1400_UTC, 3 * HOUR)
    lat, lon = offset(EVANS_LIBRARY, 5, 5)
    library = candidate(1, lat, lon, category="library")
    cafe = candidate(2, lat, lon, category="cafe")
    ranked = rank_candidates(v, [cafe, library])
    assert ranked[0].place_id == 1


def test_closed_place_loses_to_open_24_7_place():
    night_start = MONDAY_1400_UTC + 13 * HOUR  # ~03:00 local the next calendar day area
    v = visit(night_start, 20 * MINUTE)
    lat, lon = offset(EVANS_LIBRARY, 5, 5)
    closed = candidate(1, lat, lon, category="shop", opening_hours="Mo-Su 09:00-17:00")
    always_open = candidate(2, lat, lon, category="shop", opening_hours="24/7")
    ranked = rank_candidates(v, [closed, always_open])
    assert ranked[0].place_id == 2


def test_revisits_break_a_tie():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    lat, lon = offset(EVANS_LIBRARY, 5, 5)
    a = candidate(1, lat, lon, category="shop")
    b = candidate(2, lat, lon, category="shop")
    ranked = rank_candidates(v, [a, b], revisit_counts={2: 5})
    assert ranked[0].place_id == 2


def test_confidence_reflects_distance_from_visit_centroid():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    near_lat, near_lon = offset(EVANS_LIBRARY, 5, 0)
    far_lat, far_lon = offset(EVANS_LIBRARY, 45, 0)

    near_ranked = rank_candidates(v, [candidate(1, near_lat, near_lon)])
    far_ranked = rank_candidates(v, [candidate(1, far_lat, far_lon)])

    assert near_ranked[0].confidence > 0.35
    assert far_ranked[0].confidence < 0.35


def test_confidences_are_bounded_and_sum_to_at_most_one():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    candidates = [candidate(i, *offset(EVANS_LIBRARY, i * 3, 0)) for i in range(5)]
    ranked = rank_candidates(v, candidates)
    total = sum(c.confidence for c in ranked)
    assert total <= 1.0 + 1e-9
    assert all(0.0 <= c.confidence <= 1.0 for c in ranked)


def test_output_is_deterministic():
    v = visit(MONDAY_1400_UTC, 45 * MINUTE)
    candidates = [candidate(i, *offset(EVANS_LIBRARY, i * 4, i)) for i in range(6)]
    first = rank_candidates(v, candidates)
    second = rank_candidates(v, list(reversed(candidates)))
    assert [c.place_id for c in first] == [c.place_id for c in second]
    assert [c.score for c in first] == [c.score for c in second]


def test_tie_break_is_by_distance_then_place_id():
    v = visit(MONDAY_1400_UTC, 30 * MINUTE)
    lat, lon = offset(EVANS_LIBRARY, 5, 5)
    same_spot_a = candidate(2, lat, lon)
    same_spot_b = candidate(1, lat, lon)
    ranked = rank_candidates(v, [same_spot_a, same_spot_b])
    assert [c.place_id for c in ranked] == [1, 2]  # equal score+distance -> lower place_id first


def test_sunday_in_chicago_from_a_monday_utc_timestamp():
    # 2024-01-01 (Monday) 04:00 UTC is 2023-12-31 (Sunday) 22:00 in America/Chicago.
    monday_early_utc = 1_704_082_800_000
    v = visit(monday_early_utc, 20 * MINUTE)
    lat, lon = offset(EVANS_LIBRARY, 5, 5)
    sunday_only = candidate(1, lat, lon, category="shop", opening_hours="Su 21:00-23:00")
    monday_only = candidate(2, lat, lon, category="shop", opening_hours="Mo 21:00-23:00")
    ranked = rank_candidates(v, [sunday_only, monday_only])
    assert ranked[0].place_id == 1
