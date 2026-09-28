"""
Shared data contract between the place/interest models (app/ml), the API
(app/routers) and the evaluation harness (evaluation/). Plain dataclasses only:
no ORM, no I/O, so every side can be tested on its own.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class VisitFeatures:
    start_ts: int  # epoch ms, UTC
    end_ts: int  # epoch ms, UTC
    lat: float
    lon: float
    radius: float  # meters


@dataclass(frozen=True, slots=True)
class PlaceCandidate:
    place_id: int
    name: str | None
    category: str  # one of CATEGORIES
    lat: float
    lon: float
    opening_hours: str | None = None  # raw OSM opening_hours value


@dataclass(frozen=True, slots=True)
class ScoredCandidate:
    place_id: int
    score: float  # unbounded, higher is better
    confidence: float  # 0..1, confidences of one ranking sum to <= 1


@dataclass(frozen=True, slots=True)
class InterestWeight:
    category: str
    weight: float  # 0..1; non-hidden weights sum to 1 (or all 0 if no data)
    visits: int
    dwell_minutes: float
    hidden: bool = False




@dataclass(frozen=True, slots=True)
class VisitRecord:
    """One resolved visit from a user's history, oldest first when in a sequence."""

    start_ts: int  # epoch ms, UTC
    end_ts: int  # epoch ms, UTC
    place_id: int
    category: str  # one of CATEGORIES


@dataclass(frozen=True, slots=True)
class ScoredPlace:
    place_id: int
    score: float  # 0..1, comparable within one response
    reason: str  # one short human-readable line, e.g. "matches your interest in cafés"


@dataclass(frozen=True, slots=True)
class NextPlace:
    place_id: int
    probability: float  # 0..1; probabilities of one prediction sum to <= 1
    rank: int  # 1-based


CATEGORIES: tuple[str, ...] = (
    "cafe", "restaurant", "fast_food", "bar", "library", "university", "school",
    "gym", "sports", "park", "stadium", "supermarket", "convenience", "shop",
    "cinema", "theatre", "museum", "worship", "healthcare", "pharmacy", "bank",
    "fuel", "parking", "lodging", "office", "other",
)
