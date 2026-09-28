"""
The visit-history format the recommender and prediction harnesses read.

`labels.py` holds one *visit* per line because place resolution scores each
visit independently. Recommendation and prediction are about a *sequence*, so
the unit here is a whole history plus the catalog of places it could have been
drawn from, and the file is a single JSON document:

    {"meta":   {"synthetic": true, "note": "..."},
     "places": [{"place_id": 1, "name": "Evans Library", "category": "library",
                 "lat": 30.616, "lon": -96.3393, "opening_hours": null}],
     "visits": [{"start_ts": 0, "end_ts": 3600000, "place_id": 1, "category": "library"}]}

Two deliberate choices:

*A visit may name a `place_id` that is not in `places`.* That is the OSM
coverage gap, and it is the whole reason `VisitRecord` carries its own
`category`: the visit happened, we know roughly what it was, and no recommender
could ever have suggested it. The harness scores those as misses and counts them
separately as `unreachable` -- see metrics_recommend.py.

*Real history is read from a `GET /export` dump directly.* `load_history`
sniffs the shape, so nobody has to hand-convert their own export to run the
harness on it. Export files are location data: they live in the gitignored
`evaluation/data/real/`, like label files.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ml.types import CATEGORIES, PlaceCandidate

from evaluation.contract import VisitRecord

PLACE_REQUIRED = ("place_id", "name", "category", "lat", "lon")
VISIT_REQUIRED = ("start_ts", "end_ts", "place_id", "category")


class HistoryError(ValueError):
    """A history file could not be read. Always names the file and what was wrong."""

    def __init__(self, path: Path | str, where: str, message: str) -> None:
        self.path = str(path)
        self.where = where
        self.message = message
        super().__init__(f"{self.path}: {where}: {message}")


@dataclass(frozen=True, slots=True)
class History:
    """One user's resolved visits, oldest first, plus the places on offer."""

    visits: tuple[VisitRecord, ...]
    places: tuple[PlaceCandidate, ...]
    meta: dict[str, Any]

    @property
    def catalog(self) -> dict[int, PlaceCandidate]:
        return {p.place_id: p for p in self.places}

    def place(self, place_id: int) -> PlaceCandidate | None:
        return next((p for p in self.places if p.place_id == place_id), None)

    def name(self, place_id: int) -> str:
        """A printable name, falling back to the id for places outside the catalog."""
        place = self.place(place_id)
        if place is None:
            return f"place {place_id} (not in catalog)"
        return place.name or f"place {place_id}"

    @property
    def span_ts(self) -> tuple[int, int]:
        if not self.visits:
            return (0, 0)
        return (self.visits[0].start_ts, self.visits[-1].end_ts)


def _require(row: object, fields: tuple[str, ...], path: Path, where: str) -> dict:
    if not isinstance(row, dict):
        raise HistoryError(path, where, f"must be an object, got {type(row).__name__}")
    missing = [f for f in fields if f not in row]
    if missing:
        raise HistoryError(path, where, f"missing {', '.join(missing)}")
    return row


def _number(value: object, path: Path, where: str, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HistoryError(path, where, f"{field} must be a number, got {value!r}")
    return float(value)


def _int(value: object, path: Path, where: str, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise HistoryError(path, where, f"{field} must be an integer, got {value!r}")
    return value


def _parse_place(raw: object, path: Path, index: int) -> PlaceCandidate:
    where = f"places[{index}]"
    row = _require(raw, PLACE_REQUIRED, path, where)
    category = row["category"]
    if category not in CATEGORIES:
        raise HistoryError(path, where, f"unknown category {category!r} (see CATEGORIES in app/ml/types.py)")
    name = row["name"]
    if name is not None and not isinstance(name, str):
        raise HistoryError(path, where, f"name must be a string or null, got {name!r}")
    return PlaceCandidate(
        place_id=_int(row["place_id"], path, where, "place_id"),
        name=name,
        category=category,
        lat=_number(row["lat"], path, where, "lat"),
        lon=_number(row["lon"], path, where, "lon"),
        opening_hours=row.get("opening_hours"),
    )


def _parse_visit(raw: object, path: Path, index: int) -> VisitRecord:
    where = f"visits[{index}]"
    row = _require(raw, VISIT_REQUIRED, path, where)
    start_ts = _int(row["start_ts"], path, where, "start_ts")
    end_ts = _int(row["end_ts"], path, where, "end_ts")
    if end_ts < start_ts:
        raise HistoryError(path, where, f"end_ts ({end_ts}) is before start_ts ({start_ts})")
    category = row["category"]
    if category not in CATEGORIES:
        raise HistoryError(path, where, f"unknown category {category!r} (see CATEGORIES in app/ml/types.py)")
    return VisitRecord(
        start_ts=start_ts,
        end_ts=end_ts,
        place_id=_int(row["place_id"], path, where, "place_id"),
        category=category,
    )


def parse_history(payload: object, path: Path | str = "<memory>") -> History:
    """Parse either the native format or a `GET /export` dump."""
    path = Path(path) if not isinstance(path, Path) else path
    if not isinstance(payload, dict):
        raise HistoryError(path, "document", f"must be an object, got {type(payload).__name__}")

    if "places" not in payload and "visits" in payload:
        return _parse_export(payload, path)

    _require(payload, ("places", "visits"), path, "document")
    raw_places = payload["places"]
    raw_visits = payload["visits"]
    if not isinstance(raw_places, list):
        raise HistoryError(path, "places", "must be an array")
    if not isinstance(raw_visits, list):
        raise HistoryError(path, "visits", "must be an array")

    places = tuple(_parse_place(p, path, i) for i, p in enumerate(raw_places))
    seen: set[int] = set()
    for place in places:
        if place.place_id in seen:
            raise HistoryError(path, "places", f"place_id {place.place_id} appears twice")
        seen.add(place.place_id)

    visits = tuple(_parse_visit(v, path, i) for i, v in enumerate(raw_visits))
    for earlier, later in zip(visits, visits[1:], strict=False):
        if later.start_ts < earlier.start_ts:
            raise HistoryError(path, "visits", "must be sorted oldest first")

    meta = payload.get("meta", {})
    if not isinstance(meta, dict):
        raise HistoryError(path, "meta", "must be an object")
    return History(visits=visits, places=places, meta=dict(meta))


def _parse_export(payload: dict, path: Path) -> History:
    """
    Adapt a `GET /export` dump: its visits carry a nested `place` (or null).

    Unresolved visits are dropped -- they have no place to recommend or predict --
    and counted in `meta` so the drop is visible rather than silent. The catalog
    is everything that appears as a resolved place, which is the honest answer
    for a real export: we cannot know what else was nearby without the database.
    """
    raw_visits = payload["visits"]
    if not isinstance(raw_visits, list):
        raise HistoryError(path, "visits", "must be an array")

    visits: list[VisitRecord] = []
    places: dict[int, PlaceCandidate] = {}
    unresolved = 0
    for index, raw in enumerate(raw_visits):
        row = _require(raw, ("start_ts", "end_ts"), path, f"visits[{index}]")
        place = row.get("place")
        if place is None:
            unresolved += 1
            continue
        parsed = _parse_place(place | {"place_id": place.get("place_id", place.get("id"))}, path, index)
        places.setdefault(parsed.place_id, parsed)
        visits.append(
            VisitRecord(
                start_ts=_int(row["start_ts"], path, f"visits[{index}]", "start_ts"),
                end_ts=_int(row["end_ts"], path, f"visits[{index}]", "end_ts"),
                place_id=parsed.place_id,
                category=parsed.category,
            )
        )

    visits.sort(key=lambda v: (v.start_ts, v.place_id))
    return History(
        visits=tuple(visits),
        places=tuple(sorted(places.values(), key=lambda p: p.place_id)),
        meta={
            "source": "export",
            "synthetic": False,
            "resolved_visits": len(visits),
            "unresolved_visits_dropped": unresolved,
        },
    )


def load_history(path: Path | str) -> History:
    """Read one history file. Raises HistoryError naming the file and the field."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"history file not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HistoryError(path, f"line {exc.lineno}", f"invalid JSON: {exc.msg}") from exc
    return parse_history(payload, path)


def dump_history(history: History) -> str:
    """Serialize back to the native format. Round-trips through parse_history."""
    return json.dumps(
        {
            "meta": history.meta,
            "places": [
                {
                    "place_id": p.place_id,
                    "name": p.name,
                    "category": p.category,
                    "lat": round(p.lat, 7),
                    "lon": round(p.lon, 7),
                    "opening_hours": p.opening_hours,
                }
                for p in history.places
            ],
            "visits": [
                {"start_ts": v.start_ts, "end_ts": v.end_ts, "place_id": v.place_id, "category": v.category}
                for v in history.visits
            ],
        },
        indent=2,
        ensure_ascii=False,
    )


def write_history(path: Path | str, history: History) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_history(history) + "\n", encoding="utf-8")
