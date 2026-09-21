"""
Tiny parser for the common subset of the OSM `opening_hours` tag: `24/7`, `off`,
`;`-separated rules of `<day-selector> <time-selector>` where a day-selector is a
comma list of days or day ranges (`Mo-Fr`, `Sa,Su`) and a time-selector is a comma
list of `HH:MM-HH:MM` spans. Real-world tags are messy (typos, unsupported syntax,
holidays), so anything outside this subset is reported as "unknown" rather than
raising -- callers treat unknown the same as a missing value.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

Status = Literal["open", "closed", "unknown"]

_DAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")


@dataclass(frozen=True, slots=True)
class _TimeSpan:
    start_min: int  # minutes after local midnight
    end_min: int  # may be <= start_min, meaning the span wraps past midnight


@dataclass(frozen=True, slots=True)
class _Rule:
    days: frozenset[str]  # empty means "every day"
    spans: tuple[_TimeSpan, ...]  # empty means "off"


def _parse_days(spec: str) -> frozenset[str] | None:
    days: set[str] = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            start, _, end = part.partition("-")
            if start not in _DAYS or end not in _DAYS:
                return None
            i, j = _DAYS.index(start), _DAYS.index(end)
            days.update(_DAYS[i : j + 1] if i <= j else _DAYS[i:] + _DAYS[: j + 1])
        elif part in _DAYS:
            days.add(part)
        else:
            return None
    return frozenset(days)


def _parse_clock(token: str) -> int | None:
    token = token.strip()
    if len(token) != 5 or token[2] != ":":
        return None
    hours, minutes = token[:2], token[3:]
    if not (hours.isdigit() and minutes.isdigit()):
        return None
    h, m = int(hours), int(minutes)
    if not (0 <= h <= 24 and 0 <= m < 60):
        return None
    return h * 60 + m


def _parse_spans(spec: str) -> tuple[_TimeSpan, ...] | None:
    spec = spec.strip()
    if spec == "off":
        return ()
    spans: list[_TimeSpan] = []
    for token in spec.split(","):
        start_s, sep, end_s = token.strip().partition("-")
        if not sep:
            return None
        start, end = _parse_clock(start_s), _parse_clock(end_s)
        if start is None or end is None:
            return None
        spans.append(_TimeSpan(start, end))
    return tuple(spans)


def _parse(value: str) -> tuple[_Rule, ...] | None:
    rules: list[_Rule] = []
    for chunk in value.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        day_spec, sep, time_spec = chunk.partition(" ")
        if not sep:
            return None
        days = _parse_days(day_spec)
        if days is None:
            return None
        spans = _parse_spans(time_spec)
        if spans is None:
            return None
        rules.append(_Rule(days, spans))
    return tuple(rules) if rules else None


def status_at(opening_hours: str | None, moment: datetime) -> Status:
    """Whether `opening_hours` says a place is open at local time `moment`.

    Never raises: any value outside the supported subset -- or missing -- is
    "unknown", which callers should treat as neutral rather than penalizing.
    """
    if not opening_hours:
        return "unknown"
    value = opening_hours.strip()
    if not value:
        return "unknown"
    if value == "24/7":
        return "open"
    if value == "off":
        return "closed"

    try:
        rules = _parse(value)
    except Exception:
        return "unknown"
    if rules is None:
        return "unknown"

    weekday = _DAYS[moment.weekday()]
    minute = moment.hour * 60 + moment.minute

    # Later rules take precedence for a given day, matching OSM's override semantics.
    matched: _Rule | None = None
    for rule in rules:
        if not rule.days or weekday in rule.days:
            matched = rule
    if matched is None:
        return "closed"  # a day nothing mentions is implicitly closed
    if not matched.spans:
        return "closed"  # "off"

    for span in matched.spans:
        if span.start_min <= span.end_min:
            if span.start_min <= minute < span.end_min:
                return "open"
        elif minute >= span.start_min or minute < span.end_min:
            return "open"
    return "closed"
