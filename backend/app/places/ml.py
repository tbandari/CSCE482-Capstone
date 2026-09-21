"""
Bridge between the API and the place/interest models in app.ml.

The models are imported on first use, not at module load, so the API keeps
working while app.ml.places / app.ml.interests are still being built: recompute
then skips place resolution and /profile answers 503. Tests swap the getters
out with monkeypatch.
"""

from __future__ import annotations

from collections.abc import Callable

from app.ml.types import InterestWeight, PlaceCandidate, ScoredCandidate, VisitFeatures
from app.models import Place, Visit

Ranker = Callable[..., list[ScoredCandidate]]
ProfileBuilder = Callable[..., list[InterestWeight]]


class ModelsUnavailable(RuntimeError):
    """The app.ml model module this call needs is not installed."""


def _missing(error: ModuleNotFoundError, module: str) -> bool:
    # Only swallow "the module itself is absent"; a broken import inside it must still surface.
    return error.name in (module, "app.ml")


def get_ranker() -> Ranker:
    try:
        from app.ml.places import rank_candidates
    except ModuleNotFoundError as error:
        if not _missing(error, "app.ml.places"):
            raise
        raise ModelsUnavailable("app.ml.places is not installed yet") from error
    return rank_candidates


def get_profile_builder() -> ProfileBuilder:
    try:
        from app.ml.interests import build_interest_profile
    except ModuleNotFoundError as error:
        if not _missing(error, "app.ml.interests"):
            raise
        raise ModelsUnavailable("app.ml.interests is not installed yet") from error
    return build_interest_profile


def visit_features(visit: Visit) -> VisitFeatures:
    return VisitFeatures(
        start_ts=visit.start_ts, end_ts=visit.end_ts, lat=visit.lat, lon=visit.lon, radius=visit.radius
    )


def place_candidate(place: Place) -> PlaceCandidate:
    return PlaceCandidate(
        place_id=place.id,
        name=place.name,
        category=place.category,
        lat=place.lat,
        lon=place.lon,
        opening_hours=place.opening_hours,
    )
