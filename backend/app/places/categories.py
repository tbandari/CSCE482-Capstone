"""
OpenStreetMap tags -> Orbit's small category vocabulary (app.ml.types.CATEGORIES).

OSM has thousands of tag values; the models and the app only need a couple of
dozen buckets. Keys are checked in a fixed order (amenity, leisure, shop,
tourism, office, building) because the more specific key wins: a cafe inside a
university building is a cafe.
"""

from __future__ import annotations

from collections.abc import Mapping

_AMENITY = {
    "cafe": "cafe",
    "coffee_shop": "cafe",
    "restaurant": "restaurant",
    "food_court": "restaurant",
    "fast_food": "fast_food",
    "ice_cream": "fast_food",
    "bar": "bar",
    "pub": "bar",
    "biergarten": "bar",
    "nightclub": "bar",
    "library": "library",
    "university": "university",
    "college": "university",
    "school": "school",
    "kindergarten": "school",
    "cinema": "cinema",
    "theatre": "theatre",
    "arts_centre": "theatre",
    "place_of_worship": "worship",
    "hospital": "healthcare",
    "clinic": "healthcare",
    "doctors": "healthcare",
    "dentist": "healthcare",
    "pharmacy": "pharmacy",
    "bank": "bank",
    "atm": "bank",
    "fuel": "fuel",
    "charging_station": "fuel",
    "parking": "parking",
    "bicycle_parking": "parking",
    "motorcycle_parking": "parking",
}

_LEISURE = {
    "fitness_centre": "gym",
    "sports_centre": "gym",
    "stadium": "stadium",
    "pitch": "sports",
    "sports_hall": "sports",
    "track": "sports",
    "golf_course": "sports",
    "swimming_pool": "sports",
    "park": "park",
    "garden": "park",
    "nature_reserve": "park",
    "playground": "park",
    "dog_park": "park",
}

_SHOP = {
    "supermarket": "supermarket",
    "greengrocer": "supermarket",
    "convenience": "convenience",
    "chemist": "pharmacy",
}

_TOURISM = {
    "museum": "museum",
    "gallery": "museum",
    "hotel": "lodging",
    "motel": "lodging",
    "hostel": "lodging",
    "guest_house": "lodging",
    "apartment": "lodging",
}

_BUILDING = {
    "university": "university",
    "college": "university",
    "school": "school",
    "stadium": "stadium",
    "church": "worship",
    "mosque": "worship",
    "temple": "worship",
    "synagogue": "worship",
    "hospital": "healthcare",
    "hotel": "lodging",
    "office": "office",
    "supermarket": "supermarket",
}

# Tags that make an element worth indexing at all; see `is_indexable`.
_PLACE_KEYS = ("amenity", "leisure", "shop", "tourism", "office", "building")

# Every category this module can emit; a test checks it stays inside CATEGORIES.
EMITTED_CATEGORIES = frozenset(
    {*_AMENITY.values(), *_LEISURE.values(), *_SHOP.values(), *_TOURISM.values(), *_BUILDING.values()}
    | {"shop", "office", "other"}
)


def normalize_category(tags: Mapping[str, str]) -> str:
    """The Orbit category for an element's tags; "other" when nothing matches."""
    if (value := tags.get("amenity")) in _AMENITY:
        return _AMENITY[value]
    if (value := tags.get("leisure")) in _LEISURE:
        return _LEISURE[value]
    if (value := tags.get("shop")) is not None:
        return _SHOP.get(value, "shop")
    if (value := tags.get("tourism")) in _TOURISM:
        return _TOURISM[value]
    if tags.get("office") is not None:
        return "office"
    if (value := tags.get("building")) in _BUILDING:
        return _BUILDING[value]
    return "other"


def is_indexable(tags: Mapping[str, str]) -> bool:
    """Named features, or unnamed ones with a real category (an unnamed parking lot still anchors a visit)."""
    if not any(key in tags for key in _PLACE_KEYS):
        return False
    return bool(tags.get("name")) or normalize_category(tags) != "other"
