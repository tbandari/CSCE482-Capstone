"""
Loads Overpass API JSON into the `places` table.

Upserts by `osm_id`, so re-running the loader over a fresh extract updates names,
hours and categories in place and never duplicates a place. The caller commits.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Place
from app.places.categories import is_indexable, normalize_category

_CHUNK = 500


def _parse(element: dict[str, Any]) -> dict[str, Any] | None:
    """Overpass element -> Place column values, or None if it has no usable tags or position."""
    tags = element.get("tags") or {}
    if not is_indexable(tags):
        return None
    if element.get("type") == "node":
        lat, lon = element.get("lat"), element.get("lon")
    else:
        # Ways and relations only have a position when queried with `out center`.
        center = element.get("center") or {}
        lat, lon = center.get("lat"), center.get("lon")
    if lat is None or lon is None or element.get("id") is None:
        return None
    return {
        "osm_id": f"{element['type']}/{element['id']}",
        "name": tags.get("name"),
        "category": normalize_category(tags),
        "lat": float(lat),
        "lon": float(lon),
        "opening_hours": tags.get("opening_hours"),
        "tags": dict(tags),
    }


def _chunks(rows: list[dict[str, Any]]) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), _CHUNK):
        yield rows[start : start + _CHUNK]


def upsert_places(db: Session, overpass_json: dict[str, Any]) -> tuple[int, int]:
    """Returns (inserted, updated). Elements without usable tags are skipped silently."""
    parsed: dict[str, dict[str, Any]] = {}
    for element in overpass_json.get("elements", []):
        row = _parse(element)
        if row is not None:
            parsed[row["osm_id"]] = row  # last one wins if the extract repeats an element

    inserted = updated = 0
    for chunk in _chunks(list(parsed.values())):
        existing = {
            place.osm_id: place
            for place in db.scalars(select(Place).where(Place.osm_id.in_([row["osm_id"] for row in chunk])))
        }
        for row in chunk:
            place = existing.get(row["osm_id"])
            if place is None:
                db.add(Place(**row))
                inserted += 1
                continue
            changed = False
            for field, value in row.items():
                if getattr(place, field) != value:
                    setattr(place, field, value)
                    changed = True
            updated += changed
    db.flush()
    return inserted, updated
