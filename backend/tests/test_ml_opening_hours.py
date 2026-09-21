"""Unit tests for the OSM opening_hours subset parser."""

from datetime import datetime

from app.ml.opening_hours import status_at

MONDAY_NOON = datetime(2024, 1, 1, 12, 0)  # 2024-01-01 is a Monday
SUNDAY_NOON = datetime(2024, 1, 7, 12, 0)
FRIDAY_NOON = datetime(2024, 1, 5, 12, 0)


def test_missing_value_is_unknown():
    assert status_at(None, MONDAY_NOON) == "unknown"
    assert status_at("", MONDAY_NOON) == "unknown"
    assert status_at("   ", MONDAY_NOON) == "unknown"


def test_24_7_is_always_open():
    assert status_at("24/7", MONDAY_NOON) == "open"
    assert status_at("24/7", datetime(2024, 1, 1, 3, 0)) == "open"
    assert status_at("24/7", SUNDAY_NOON) == "open"


def test_off_is_always_closed():
    assert status_at("off", MONDAY_NOON) == "closed"


def test_day_range_and_single_time_span():
    hours = "Mo-Fr 07:00-22:00"
    assert status_at(hours, MONDAY_NOON) == "open"
    assert status_at(hours, FRIDAY_NOON) == "open"
    assert status_at(hours, datetime(2024, 1, 1, 6, 0)) == "closed"  # before open
    assert status_at(hours, datetime(2024, 1, 1, 23, 0)) == "closed"  # after close
    assert status_at(hours, SUNDAY_NOON) == "closed"  # day not mentioned


def test_day_list_and_multiple_rules():
    hours = "Mo-Fr 07:00-22:00; Sa,Su 09:00-20:00"
    assert status_at(hours, SUNDAY_NOON) == "open"
    assert status_at(hours, datetime(2024, 1, 6, 8, 0)) == "closed"  # Saturday, before 09:00
    assert status_at(hours, datetime(2024, 1, 6, 12, 0)) == "open"


def test_multiple_time_spans_with_commas():
    hours = "Mo-Fr 07:00-11:00,13:00-18:00"
    assert status_at(hours, datetime(2024, 1, 1, 8, 0)) == "open"
    assert status_at(hours, datetime(2024, 1, 1, 12, 0)) == "closed"  # lunch gap
    assert status_at(hours, datetime(2024, 1, 1, 14, 0)) == "open"


def test_later_rule_overrides_earlier_rule_for_same_day():
    hours = "Mo-Su 09:00-17:00; Su off"
    assert status_at(hours, MONDAY_NOON) == "open"
    assert status_at(hours, SUNDAY_NOON) == "closed"


def test_garbage_input_is_unknown_and_never_raises():
    for garbage in ["not opening hours", "Mo-Fr", "Mo-Fr 07:00", "Xx 07:00-22:00", "Mo-Fr 25:99-30:00", ";;;", "07:00-22:00 Mo-Fr"]:
        assert status_at(garbage, MONDAY_NOON) == "unknown"
