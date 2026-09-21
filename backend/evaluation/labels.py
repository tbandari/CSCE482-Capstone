"""
The hand-labeling format and its loader.

A label file is JSONL: one labeled visit per line. Each line is *self-contained*
-- it carries a snapshot of the candidates that were on offer -- so evaluation
never needs the database, and a label stays meaningful even after the OSM import
is refreshed underneath it.

    {"id": "george-2026-09-28-01",
     "visit": {"start_ts": 0, "end_ts": 0, "lat": 0, "lon": 0, "radius": 0},
     "candidates": [{"place_id": 1, "name": "Evans Library", "category": "library",
                     "lat": 0, "lon": 0, "opening_hours": null}],
     "truth_place_id": 1, "labeler": "george", "notes": ""}

`truth_place_id: null` means "none of these candidates" -- the visit is not at a
place we could have resolved (a parking lot, a road, a friend's apartment).

As an extension to strict JSONL, blank lines and lines starting with `#` are
skipped, so a file can carry a human-readable header. Line numbers in error
messages are 1-based and count every physical line, comments included, so they
match what an editor shows.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from app.ml.types import CATEGORIES, PlaceCandidate, VisitFeatures

VISIT_FIELDS = ("start_ts", "end_ts", "lat", "lon", "radius")
CANDIDATE_REQUIRED = ("place_id", "name", "category", "lat", "lon")


class LabelError(ValueError):
    """A label file could not be read. Always names the file and the line."""

    def __init__(self, path: Path | str, line_no: int, message: str) -> None:
        self.path = str(path)
        self.line_no = line_no
        self.message = message
        super().__init__(f"{self.path}:{line_no}: {message}")


@dataclass(frozen=True, slots=True)
class LabeledVisit:
    """One hand-labeled visit: the visit, what it could have been, what it was."""

    id: str
    visit: VisitFeatures
    candidates: tuple[PlaceCandidate, ...]
    truth_place_id: int | None
    labeler: str = ""
    notes: str = ""

    @property
    def has_truth(self) -> bool:
        """False for 'none of these candidates' labels."""
        return self.truth_place_id is not None

    @property
    def truth(self) -> PlaceCandidate | None:
        if self.truth_place_id is None:
            return None
        return next(c for c in self.candidates if c.place_id == self.truth_place_id)

    def candidate(self, place_id: int) -> PlaceCandidate | None:
        return next((c for c in self.candidates if c.place_id == place_id), None)


def _require_mapping(value: object, path: Path, line_no: int, what: str) -> dict:
    if not isinstance(value, dict):
        raise LabelError(path, line_no, f"{what} must be an object, got {type(value).__name__}")
    return value


def _require_number(value: object, path: Path, line_no: int, what: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise LabelError(path, line_no, f"{what} must be a number, got {value!r}")
    return float(value)


def _parse_visit(raw: object, path: Path, line_no: int) -> VisitFeatures:
    visit = _require_mapping(raw, path, line_no, "'visit'")
    missing = [f for f in VISIT_FIELDS if f not in visit]
    if missing:
        raise LabelError(path, line_no, f"'visit' is missing {', '.join(missing)}")
    start_ts = int(_require_number(visit["start_ts"], path, line_no, "visit.start_ts"))
    end_ts = int(_require_number(visit["end_ts"], path, line_no, "visit.end_ts"))
    if end_ts < start_ts:
        raise LabelError(path, line_no, f"visit.end_ts ({end_ts}) is before visit.start_ts ({start_ts})")
    lat = _require_number(visit["lat"], path, line_no, "visit.lat")
    lon = _require_number(visit["lon"], path, line_no, "visit.lon")
    if not -90 <= lat <= 90:
        raise LabelError(path, line_no, f"visit.lat out of range: {lat}")
    if not -180 <= lon <= 180:
        raise LabelError(path, line_no, f"visit.lon out of range: {lon}")
    radius = _require_number(visit["radius"], path, line_no, "visit.radius")
    if radius < 0:
        raise LabelError(path, line_no, f"visit.radius must not be negative: {radius}")
    return VisitFeatures(start_ts=start_ts, end_ts=end_ts, lat=lat, lon=lon, radius=radius)


def _parse_candidate(raw: object, path: Path, line_no: int, index: int) -> PlaceCandidate:
    candidate = _require_mapping(raw, path, line_no, f"candidate {index}")
    missing = [f for f in CANDIDATE_REQUIRED if f not in candidate]
    if missing:
        raise LabelError(path, line_no, f"candidate {index} is missing {', '.join(missing)}")
    place_id = candidate["place_id"]
    if isinstance(place_id, bool) or not isinstance(place_id, int):
        raise LabelError(path, line_no, f"candidate {index}: place_id must be an integer, got {place_id!r}")
    name = candidate["name"]
    if name is not None and not isinstance(name, str):
        raise LabelError(path, line_no, f"candidate {index}: name must be a string or null, got {name!r}")
    category = candidate["category"]
    if category not in CATEGORIES:
        raise LabelError(
            path, line_no, f"candidate {index}: unknown category {category!r} (see CATEGORIES in app/ml/types.py)"
        )
    opening_hours = candidate.get("opening_hours")
    if opening_hours is not None and not isinstance(opening_hours, str):
        raise LabelError(path, line_no, f"candidate {index}: opening_hours must be a string or null")
    return PlaceCandidate(
        place_id=place_id,
        name=name,
        category=category,
        lat=_require_number(candidate["lat"], path, line_no, f"candidate {index}.lat"),
        lon=_require_number(candidate["lon"], path, line_no, f"candidate {index}.lon"),
        opening_hours=opening_hours,
    )


def parse_label(raw_line: str, path: Path, line_no: int) -> LabeledVisit:
    """Parse one JSONL line. Raises LabelError naming the file and line."""
    try:
        row = json.loads(raw_line)
    except json.JSONDecodeError as exc:
        raise LabelError(path, line_no, f"invalid JSON: {exc.msg}") from exc

    row = _require_mapping(row, path, line_no, "a label")
    for field in ("id", "visit", "candidates"):
        if field not in row:
            raise LabelError(path, line_no, f"missing required field {field!r}")

    label_id = row["id"]
    if not isinstance(label_id, str) or not label_id.strip():
        raise LabelError(path, line_no, f"'id' must be a non-empty string, got {label_id!r}")

    raw_candidates = row["candidates"]
    if not isinstance(raw_candidates, list):
        raise LabelError(path, line_no, "'candidates' must be an array")
    candidates = tuple(_parse_candidate(c, path, line_no, i) for i, c in enumerate(raw_candidates))

    seen: set[int] = set()
    for candidate in candidates:
        if candidate.place_id in seen:
            raise LabelError(path, line_no, f"candidate place_id {candidate.place_id} appears twice")
        seen.add(candidate.place_id)

    truth = row.get("truth_place_id")
    if truth is not None:
        if isinstance(truth, bool) or not isinstance(truth, int):
            raise LabelError(path, line_no, f"'truth_place_id' must be an integer or null, got {truth!r}")
        if truth not in seen:
            raise LabelError(
                path,
                line_no,
                f"truth_place_id {truth} is not among the candidates "
                f"({', '.join(str(c.place_id) for c in candidates) or 'none'})",
            )

    return LabeledVisit(
        id=label_id,
        visit=_parse_visit(row["visit"], path, line_no),
        candidates=candidates,
        truth_place_id=truth,
        labeler=str(row.get("labeler", "")),
        notes=str(row.get("notes", "")),
    )


def iter_labels(path: Path | str) -> Iterator[LabeledVisit]:
    """Yield labels from one JSONL file, skipping blank and `#` comment lines."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"label file not found: {path}")
    with path.open(encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            yield parse_label(stripped, path, line_no)


def load_labels(paths: Path | str | Iterable[Path | str]) -> list[LabeledVisit]:
    """
    Load one or more label files into a single set.

    Ids must be unique across the whole set, not just within a file -- two
    labelers producing the same id would silently double-count.
    """
    if isinstance(paths, (str, Path)):
        paths = [paths]
    labels: list[LabeledVisit] = []
    origin: dict[str, str] = {}
    for path in paths:
        for label in iter_labels(path):
            if label.id in origin:
                raise ValueError(f"duplicate label id {label.id!r}: seen in {origin[label.id]} and again in {path}")
            origin[label.id] = str(path)
            labels.append(label)
    return labels


def dump_label(label: LabeledVisit) -> str:
    """Serialize one label back to a JSONL line. Round-trips through parse_label."""
    return json.dumps(
        {
            "id": label.id,
            "visit": {
                "start_ts": label.visit.start_ts,
                "end_ts": label.visit.end_ts,
                "lat": round(label.visit.lat, 7),
                "lon": round(label.visit.lon, 7),
                "radius": round(label.visit.radius, 1),
            },
            "candidates": [
                {
                    "place_id": c.place_id,
                    "name": c.name,
                    "category": c.category,
                    "lat": round(c.lat, 7),
                    "lon": round(c.lon, 7),
                    "opening_hours": c.opening_hours,
                }
                for c in label.candidates
            ],
            "truth_place_id": label.truth_place_id,
            "labeler": label.labeler,
            "notes": label.notes,
        },
        ensure_ascii=False,
    )


def write_labels(path: Path | str, labels: Sequence[LabeledVisit], header: Sequence[str] = ()) -> None:
    """Write a JSONL label file, with optional `#` header lines."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for line in header:
            handle.write(f"# {line}\n" if line else "#\n")
        for label in labels:
            handle.write(dump_label(label) + "\n")
