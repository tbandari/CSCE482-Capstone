"""
Load OpenStreetMap places into the Orbit database.

    python scripts/load_osm.py --file extract.json
    python scripts/load_osm.py --bbox 30.57,-96.39,30.66,-96.28 [--save extract.json]

`--bbox` (south,west,north,east) downloads public map data once from the Overpass
API. Only the bounding box is sent; no user data ever leaves the server, and place
resolution afterwards runs entirely against this local copy.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# Run as a plain script from backend/, so make `app` importable without an install.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.places.loader import upsert_places  # noqa: E402

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def overpass_query(south: float, west: float, north: float, east: float) -> str:
    bbox = f"{south},{west},{north},{east}"
    return f"""
[out:json][timeout:180];
(
  nwr["name"]["amenity"]({bbox});
  nwr["name"]["shop"]({bbox});
  nwr["name"]["leisure"]({bbox});
  nwr["name"]["tourism"]({bbox});
  nwr["amenity"="parking"]({bbox});
);
out center;
""".strip()


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        south, west, north, east = (float(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected south,west,north,east") from error
    if not (south < north and west < east):
        raise argparse.ArgumentTypeError("south must be < north and west < east")
    return south, west, north, east


def fetch(bbox: tuple[float, float, float, float]) -> dict:
    body = urllib.parse.urlencode({"data": overpass_query(*bbox)}).encode()
    request = urllib.request.Request(
        OVERPASS_URL, data=body, headers={"User-Agent": "orbit-capstone/0.1 (CSCE 482, Texas A&M)"}
    )
    with urllib.request.urlopen(request, timeout=200) as response:
        return json.load(response)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path, help="Overpass JSON file to load")
    source.add_argument("--bbox", type=parse_bbox, help="south,west,north,east to download from Overpass")
    parser.add_argument("--save", type=Path, help="with --bbox, also write the downloaded JSON here")
    args = parser.parse_args(argv)

    if args.file:
        data = json.loads(args.file.read_text())
    else:
        print(f"Downloading places in {args.bbox} from Overpass…", file=sys.stderr)
        data = fetch(args.bbox)
        if args.save:
            args.save.write_text(json.dumps(data))

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        inserted, updated = upsert_places(db, data)
        db.commit()
    print(f"{len(data.get('elements', []))} elements read, {inserted} places inserted, {updated} updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
