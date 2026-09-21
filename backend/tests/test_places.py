import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ml.types import CATEGORIES
from app.models import Place
from app.places.categories import EMITTED_CATEGORIES, is_indexable, normalize_category
from app.places.loader import upsert_places


@pytest.mark.parametrize(
    ("tags", "category"),
    [
        ({"amenity": "cafe"}, "cafe"),
        ({"amenity": "library"}, "library"),
        ({"leisure": "fitness_centre"}, "gym"),
        ({"leisure": "sports_centre"}, "gym"),
        ({"amenity": "university"}, "university"),
        ({"building": "university"}, "university"),
        ({"leisure": "stadium"}, "stadium"),
        ({"shop": "supermarket"}, "supermarket"),
        ({"shop": "books"}, "shop"),
        ({"amenity": "place_of_worship"}, "worship"),
        ({"amenity": "dentist"}, "healthcare"),
        ({"tourism": "hotel"}, "lodging"),
        ({"office": "company"}, "office"),
        # The more specific key wins: a cafe inside a university building is a cafe.
        ({"amenity": "cafe", "building": "university"}, "cafe"),
        ({"building": "yes"}, "other"),
        ({}, "other"),
    ],
)
def test_normalize_category(tags: dict[str, str], category: str) -> None:
    assert normalize_category(tags) == category


def test_every_emitted_category_is_in_the_shared_vocabulary() -> None:
    assert EMITTED_CATEGORIES <= set(CATEGORIES)


def test_is_indexable() -> None:
    assert is_indexable({"amenity": "cafe", "name": "Sweet Eugene's"})
    assert is_indexable({"amenity": "parking"})  # unnamed but categorised
    assert not is_indexable({"building": "yes"})  # unnamed and uncategorised
    assert not is_indexable({"highway": "residential", "name": "Some Street"})
    assert not is_indexable({})


def test_upsert_loads_the_sample_and_skips_unusable_elements(db: Session, overpass_sample: dict) -> None:
    inserted, updated = upsert_places(db, overpass_sample)
    db.commit()
    assert (inserted, updated) == (10, 0)

    zachry = db.scalar(select(Place).where(Place.osm_id == "way/2001"))
    assert zachry is not None
    assert zachry.category == "university"
    assert (zachry.lat, zachry.lon) == (30.6212, -96.3403)  # from the way's center
    evans = db.scalar(select(Place).where(Place.name == "Evans Library"))
    assert evans is not None and evans.opening_hours == "Mo-Su 00:00-24:00"
    assert evans.tags["amenity"] == "library"
    for skipped in ("node/1007", "way/2004", "way/2005"):
        assert db.scalar(select(Place).where(Place.osm_id == skipped)) is None


def test_upsert_is_idempotent_and_updates_in_place(db: Session, overpass_sample: dict) -> None:
    upsert_places(db, overpass_sample)
    db.commit()
    assert upsert_places(db, overpass_sample) == (0, 0)

    renamed = {"elements": [dict(overpass_sample["elements"][0], tags={"amenity": "library", "name": "Sterling C. Evans Library"})]}
    assert upsert_places(db, renamed) == (0, 1)
    db.commit()
    assert db.scalar(select(func.count(Place.id))) == 10
    assert db.scalar(select(Place.name).where(Place.osm_id == "node/1001")) == "Sterling C. Evans Library"
