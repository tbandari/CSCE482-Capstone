"""
Generate the committed synthetic visit histories.

    cd backend && python -m evaluation.make_synthetic_history

Twelve weeks of made-up student life, so the recommender and prediction
harnesses have something to run against in CI and in a PR review without
anyone's real location history. Like `make_synthetic.py`, it is a regression
fixture and a way to compare models against each other -- never evidence of
real-world accuracy. Real numbers come from our own exports, per
docs/eval/labeling-protocol.md.

Three things are built in on purpose, because without them the evaluation cannot
tell a good recommender from a lazy one:

**A behaviour change in the last three weeks.** The hold-out cutoff is three
weeks before the end, and at exactly that point the primary student drops the
campus rec centre for a new gym across town, and picks up a new cafe. Both are
places they have never been. A recommender that just replays history scores zero
on them; one that reads "this person likes gyms and cafes" off the interest
profile can find them. That contrast is the point of the fixture.

**A cohort, not one student.** The popularity baseline -- the bar the proposal
sets -- ranks places by how often they appear *across the labeled set*. With a
single history, "popular" and "places this user goes" are the same list, the
baseline has nothing to say, and the comparison is vacuous. So five more
students with different routines share the same campus. Popularity is then a
real cross-user signal, and the recommender is scored over six hold-out cases
rather than one.

**Visits to places that are not in the catalog.** A few visits point at place
ids that `places` deliberately omits: our OSM extract does not have everything.
No recommender can ever suggest those, and the harness counts them as
`unreachable` so a coverage gap is never read as a model failure.

The catalog is about two hundred places, because the size of the haystack is
part of the metric. With thirty places, "the top 20" is most of the town and
even the random baseline posts a respectable hit@20; a real OSM extract around
campus has hundreds, and picking twenty out of those is the actual job.

**Read the numbers this fixture produces as a floor test, not as accuracy.**
Each student's held-out discoveries are drawn from their own top categories --
two from places their cohort already goes to, two nobody in the cohort has
visited, and one deliberately off-profile so nothing can score 100%. So an
interest-driven recommender *can* win here by construction, and beating
popularity on this set is necessary, not sufficient. The claim in the report
has to come from our own exports.

Geography is the Texas A&M area, extending the places in `make_synthetic.py` so
the two synthetic sets describe the same campus. Named places are real campus
landmarks; the rest of the catalog is generic street-plus-category filler, so
the fixture never puts words in a real business's mouth.
"""

from __future__ import annotations

import random
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.ml.types import PlaceCandidate

from evaluation.contract import VisitRecord
from evaluation.history import History, write_history

SEED = 482
WEEKS = 12
#: The hold-out window, and the week the behaviour change starts. Same number on
#: purpose: the change has to land entirely in the test half or it is not held out.
HOLDOUT_WEEKS = 3
CHANGE_WEEK = WEEKS - HOLDOUT_WEEKS

#: Monday 2026-07-06 00:00 America/Chicago (CDT, UTC-5), so the twelve weeks end
#: Sunday 2026-09-27 -- the Sunday before the Part 2 sprint.
HISTORY_START = datetime(2026, 7, 6, 5, 0, tzinfo=timezone.utc)
HISTORY_START_TS = int(HISTORY_START.timestamp() * 1000)

MINUTE_MS = 60_000
HOUR_MS = 60 * MINUTE_MS
DAY_MS = 24 * HOUR_MS
WEEK_MS = 7 * DAY_MS

#: Real campus landmarks, kept identical to make_synthetic.py where they overlap.
#: (name, category, lat, lon). Ids are assigned in this order, from 1.
NAMED_PLACES: tuple[tuple[str, str, float, float], ...] = (
    # -- the six anchors from make_synthetic.py, same coordinates ------------
    ("Evans Library", "library", 30.6160, -96.3393),
    ("Zachry Engineering Complex", "university", 30.6212, -96.3403),
    ("Student Rec Center", "gym", 30.6073, -96.3436),
    ("Kyle Field", "stadium", 30.6101, -96.3402),
    ("Northgate Coffee", "cafe", 30.6222, -96.3465),
    ("Grocery store", "supermarket", 30.6275, -96.3175),
    # -- more of the campus and the town ------------------------------------
    ("Sweet Eugene's", "cafe", 30.6187, -96.3399),
    ("Harrington Coffee", "cafe", 30.6148, -96.3421),
    ("Blue Baker", "cafe", 30.6003, -96.3145),
    ("Sbisa Dining Hall", "restaurant", 30.6165, -96.3470),
    ("Torchy's Tacos", "restaurant", 30.6238, -96.3448),
    ("Fuego Tortilla Grill", "fast_food", 30.6242, -96.3470),
    ("Chicken Oil Company", "restaurant", 30.6259, -96.3364),
    ("Layne's", "fast_food", 30.6236, -96.3459),
    ("Panda Express MSC", "fast_food", 30.6120, -96.3417),
    ("Memorial Student Center", "university", 30.6122, -96.3410),
    ("Annenberg Presidential Conference Center", "university", 30.6086, -96.3357),
    ("Peterson Building", "university", 30.6196, -96.3435),
    ("Bush Library", "library", 30.5883, -96.3520),
    ("Aggie Strength Club", "gym", 30.6300, -96.3103),
    ("Southwood Athletic Center", "gym", 30.5934, -96.2926),
    ("Penberthy Rec Fields", "sports", 30.6053, -96.3492),
    ("Research Park Trail", "park", 30.6020, -96.3560),
    ("Lick Creek Park", "park", 30.5629, -96.2372),
    ("Wolf Pen Creek Park", "park", 30.6197, -96.3055),
    ("Century Square Market", "supermarket", 30.6157, -96.3113),
    ("Northgate Market", "convenience", 30.6224, -96.3449),
    ("Campus Convenience", "convenience", 30.6136, -96.3448),
    ("Post Oak Mall", "shop", 30.6081, -96.2963),
    ("Premiere Cinema", "cinema", 30.6163, -96.3095),
    ("Stark Galleries", "museum", 30.6122, -96.3406),
    ("Rudder Theatre", "theatre", 30.6127, -96.3415),
    ("St. Mary's Catholic Center", "worship", 30.6207, -96.3427),
    ("Beutel Health Center", "healthcare", 30.6149, -96.3447),
    ("Campus Pharmacy", "pharmacy", 30.6143, -96.3439),
    ("Northgate Tap", "bar", 30.6228, -96.3466),
)

#: The rest of the town. Generic street-plus-category names, built rather than
#: typed: the point of these is to be a haystack of plausible places nobody has
#: to invent business names for. (street or neighbourhood, category, how many).
FILLER_AREAS: tuple[str, ...] = (
    "Holleman", "Wellborn", "Rock Prairie", "Harvey", "Villa Maria", "Briarcrest",
    "Texas Ave", "University Dr", "Southwest Pkwy", "Longmire", "Deacon", "Barron",
    "Graham", "Boonville", "Finfeather", "Carter Creek", "Greens Prairie", "Dominik",
    "Anderson", "Luther",
)

#: (category, noun used in the name, how many to build).
FILLER_SPEC: tuple[tuple[str, str, int], ...] = (
    ("cafe", "Coffee", 14),
    ("restaurant", "Kitchen", 16),
    ("fast_food", "Grill", 14),
    ("bar", "Tavern", 7),
    ("gym", "Fitness", 9),
    ("sports", "Courts", 5),
    ("park", "Park", 10),
    ("supermarket", "Market", 6),
    ("convenience", "Corner Store", 9),
    ("shop", "Outfitters", 14),
    ("pharmacy", "Pharmacy", 6),
    ("healthcare", "Clinic", 8),
    ("bank", "Credit Union", 6),
    ("worship", "Chapel", 6),
    ("library", "Reading Room", 3),
    ("museum", "Gallery", 4),
    ("cinema", "Cinema", 3),
    ("theatre", "Playhouse", 3),
    ("university", "Center", 6),
    ("school", "Academy", 5),
    ("lodging", "Inn", 5),
    ("office", "Offices", 5),
)

#: Bounding box for filler coordinates: College Station and Bryan.
FILLER_BBOX = (30.5600, 30.6600, -96.3900, -96.2700)

#: Visited, but not in `places`: the OSM extract does not have them. Ids start at
#: 900 so they can never collide with a catalog id.
GAP_PLACES: tuple[tuple[int, str, str], ...] = (
    (901, "a friend's apartment", "other"),
    (902, "the new taco truck on University", "fast_food"),
)


def _build_catalog() -> tuple[PlaceCandidate, ...]:
    """Named landmarks first, then deterministic filler. Ids follow that order."""
    places = [
        PlaceCandidate(place_id=i, name=name, category=category, lat=lat, lon=lon)
        for i, (name, category, lat, lon) in enumerate(NAMED_PLACES, start=1)
    ]
    rng = random.Random(f"{SEED}|catalog")
    lat_lo, lat_hi, lon_lo, lon_hi = FILLER_BBOX
    next_id = len(places) + 1
    area = 0
    for category, noun, count in FILLER_SPEC:
        for _ in range(count):
            name = f"{FILLER_AREAS[area % len(FILLER_AREAS)]} {noun}"
            area += 1
            places.append(
                PlaceCandidate(
                    place_id=next_id,
                    name=name,
                    category=category,
                    lat=round(rng.uniform(lat_lo, lat_hi), 6),
                    lon=round(rng.uniform(lon_lo, lon_hi), 6),
                )
            )
            next_id += 1
    names = [p.name for p in places]
    assert len(set(names)) == len(names), "catalog names must be unique"
    return tuple(places)


PLACES: tuple[PlaceCandidate, ...] = _build_catalog()
PLACE_IDS: dict[str, int] = {p.name: p.place_id for p in PLACES if p.name}
CATEGORY_BY_ID: dict[int, str] = {p.place_id: p.category for p in PLACES}
CATEGORY_BY_ID.update({place_id: category for place_id, _, category in GAP_PLACES})


@dataclass(frozen=True, slots=True)
class Slot:
    """One recurring habit: this place, these days, roughly this time, this often."""

    place: str
    days: tuple[int, ...]  # 0 = Monday
    window: tuple[float, float]  # local hour the visit starts in
    duration_min: tuple[int, int]
    p: float = 1.0  # chance it happens on an eligible day


@dataclass(frozen=True, slots=True)
class Student:
    """A made-up person. `changes` and `retires` only take effect from CHANGE_WEEK."""

    key: str
    label: str
    routine: tuple[Slot, ...]
    one_offs: tuple[str, ...] = ()
    changes: tuple[Slot, ...] = ()
    retires: tuple[str, ...] = ()
    gap_visits: tuple[tuple[int, int], ...] = field(default=())  # (place_id, week)


STUDENTS: tuple[Student, ...] = (
    Student(
        key="student",
        label="engineering undergrad; the primary history, and the one the report quotes",
        routine=(
            Slot("Northgate Coffee", (0, 1, 2, 3, 4), (7.5, 9.0), (15, 40), 0.85),
            Slot("Zachry Engineering Complex", (0, 1, 2, 3), (9.0, 10.5), (120, 300), 0.95),
            Slot("Panda Express MSC", (0, 2, 4), (12.0, 13.5), (20, 45), 0.6),
            Slot("Evans Library", (0, 1, 2, 3, 6), (14.0, 16.0), (60, 210), 0.7),
            Slot("Student Rec Center", (0, 2, 4), (17.0, 19.0), (45, 90), 0.75),
            Slot("Campus Convenience", (1, 3), (21.0, 22.5), (5, 15), 0.4),
            Slot("Grocery store", (5,), (11.0, 13.0), (25, 55), 0.8),
            Slot("Sbisa Dining Hall", (5, 6), (18.0, 19.5), (30, 70), 0.5),
            Slot("Wolf Pen Creek Park", (6,), (9.0, 11.0), (30, 80), 0.35),
        ),
        one_offs=("Premiere Cinema", "Beutel Health Center", "Post Oak Mall", "Kyle Field"),
        # The behaviour change: a new gym and a new cafe, neither ever visited before.
        changes=(
            Slot("Aggie Strength Club", (0, 2, 4), (17.0, 19.0), (50, 95), 0.8),
            Slot("Blue Baker", (1, 3), (8.0, 9.5), (20, 45), 0.6),
        ),
        retires=("Student Rec Center",),
        gap_visits=((901, 10), (902, 11)),
    ),
    Student(
        key="peer-01",
        label="architecture student, studio hours, no gym",
        routine=(
            Slot("Sweet Eugene's", (0, 1, 2, 3, 4), (8.0, 9.5), (25, 60), 0.8),
            Slot("Peterson Building", (0, 1, 2, 3, 4), (10.0, 11.5), (180, 400), 0.9),
            Slot("Sbisa Dining Hall", (0, 1, 2, 3, 4), (12.5, 13.5), (25, 50), 0.7),
            Slot("Evans Library", (1, 3), (19.0, 21.0), (60, 180), 0.6),
            Slot("Northgate Market", (2, 5), (20.0, 22.0), (5, 20), 0.5),
            Slot("Stark Galleries", (6,), (13.0, 15.0), (40, 90), 0.3),
            Slot("Century Square Market", (5,), (14.0, 16.0), (30, 60), 0.7),
        ),
        one_offs=("Rudder Theatre", "Premiere Cinema"),
        changes=(Slot("Harrington Coffee", (0, 2, 4), (8.0, 9.5), (20, 45), 0.7),),
        retires=("Sweet Eugene's",),
    ),
    Student(
        key="peer-02",
        label="athlete; trains daily, eats out, rarely studies late",
        routine=(
            Slot("Student Rec Center", (0, 1, 2, 3, 4), (6.0, 7.5), (60, 110), 0.9),
            Slot("Memorial Student Center", (0, 1, 2, 3, 4), (9.5, 11.0), (90, 200), 0.8),
            Slot("Layne's", (0, 2, 4), (12.5, 13.5), (15, 35), 0.7),
            Slot("Penberthy Rec Fields", (1, 3, 5), (16.0, 18.0), (60, 130), 0.75),
            Slot("Torchy's Tacos", (4, 5), (19.0, 21.0), (35, 80), 0.6),
            Slot("Grocery store", (6,), (12.0, 14.0), (25, 50), 0.7),
        ),
        one_offs=("Kyle Field", "Southwood Athletic Center", "Campus Pharmacy"),
        changes=(Slot("Lick Creek Park", (6,), (8.0, 10.0), (60, 150), 0.7),),
    ),
    Student(
        key="peer-03",
        label="grad student off campus; library-heavy, cooks at home",
        routine=(
            Slot("Bush Library", (0, 1, 2, 3, 4), (9.0, 10.5), (180, 420), 0.85),
            Slot("Annenberg Presidential Conference Center", (1, 3), (13.0, 14.5), (60, 150), 0.5),
            Slot("Blue Baker", (0, 2, 4), (12.0, 13.0), (30, 60), 0.6),
            Slot("Century Square Market", (4,), (17.0, 19.0), (30, 60), 0.8),
            Slot("Research Park Trail", (5, 6), (7.5, 9.5), (40, 80), 0.6),
            Slot("Wolf Pen Creek Park", (6,), (16.0, 18.0), (30, 70), 0.4),
        ),
        one_offs=("Beutel Health Center", "Post Oak Mall"),
        changes=(Slot("Evans Library", (0, 2), (9.0, 10.5), (180, 360), 0.6),),
        retires=("Bush Library",),
        gap_visits=((901, 9),),
    ),
    Student(
        key="peer-04",
        label="freshman in the dorms; social, late nights, no car",
        routine=(
            Slot("Sbisa Dining Hall", (0, 1, 2, 3, 4, 5, 6), (11.5, 13.0), (25, 55), 0.8),
            Slot("Memorial Student Center", (0, 1, 2, 3), (14.0, 16.0), (60, 180), 0.7),
            Slot("Campus Convenience", (0, 1, 2, 3, 4), (22.0, 23.5), (5, 20), 0.5),
            Slot("Fuego Tortilla Grill", (4, 5), (22.0, 23.5), (20, 50), 0.7),
            Slot("Northgate Tap", (4, 5), (20.0, 21.5), (60, 140), 0.5),
            Slot("Student Rec Center", (1, 3), (16.0, 18.0), (40, 80), 0.45),
            Slot("St. Mary's Catholic Center", (6,), (10.0, 11.0), (50, 80), 0.5),
        ),
        one_offs=("Kyle Field", "Premiere Cinema", "Campus Pharmacy"),
        changes=(Slot("Chicken Oil Company", (5,), (18.0, 20.0), (45, 100), 0.7),),
        gap_visits=((902, 10),),
    ),
    Student(
        key="peer-05",
        label="commuter, part-time job, on campus two days a week",
        routine=(
            Slot("Harrington Coffee", (1, 3), (7.5, 9.0), (20, 45), 0.8),
            Slot("Zachry Engineering Complex", (1, 3), (9.5, 11.0), (150, 330), 0.85),
            Slot("Evans Library", (1, 3), (15.0, 17.0), (60, 160), 0.5),
            Slot("Post Oak Mall", (0, 2, 4), (13.0, 15.0), (240, 400), 0.8),
            Slot("Grocery store", (4,), (18.0, 20.0), (25, 55), 0.7),
            Slot("Premiere Cinema", (5,), (19.0, 21.5), (100, 160), 0.35),
            Slot("Lick Creek Park", (6,), (9.0, 11.0), (50, 120), 0.4),
        ),
        one_offs=("Torchy's Tacos", "Campus Pharmacy", "Stark Galleries"),
        changes=(Slot("Southwood Athletic Center", (0, 2), (18.0, 19.5), (45, 90), 0.75),),
    ),
)


def cutoff_ts() -> int:
    """The hold-out cutoff: the instant the behaviour change starts."""
    return HISTORY_START_TS + CHANGE_WEEK * WEEK_MS


def end_ts() -> int:
    return HISTORY_START_TS + WEEKS * WEEK_MS


def _emit(rng: random.Random, slot: Slot, week: int, day: int) -> VisitRecord:
    start_hour = rng.uniform(*slot.window)
    start_ts = HISTORY_START_TS + week * WEEK_MS + day * DAY_MS + int(start_hour * HOUR_MS)
    duration = rng.randint(*slot.duration_min) * MINUTE_MS
    place_id = PLACE_IDS[slot.place]
    return VisitRecord(
        start_ts=start_ts, end_ts=start_ts + duration, place_id=place_id, category=CATEGORY_BY_ID[place_id]
    )


def _drop_overlaps(visits: list[VisitRecord]) -> list[VisitRecord]:
    """
    Keep one visit at a time.

    Two habits can roll the same hour, and stay detection can never produce
    overlapping visits, so a fixture that did would be measuring something the
    model will never see. The earlier start wins.
    """
    kept: list[VisitRecord] = []
    for visit in sorted(visits, key=lambda v: (v.start_ts, v.place_id)):
        if kept and visit.start_ts < kept[-1].end_ts:
            continue
        kept.append(visit)
    return kept




#: How each student's held-out discoveries are made up:
#: (places their cohort already goes to, places nobody in it has been,
#: off-profile). All but the last are drawn from the student's own top
#: categories. The middle group is what only an interest model can find; the
#: first is what popularity can also find, so the baseline is a real competitor;
#: the last is there so nothing can score 100%.
DISCOVERY_MIX: tuple[int, int, int] = (2, 2, 1)

#: Categories that are never a destination worth recommending, mirroring
#: EXCLUDED_CATEGORIES in app/ml/interests.py.
NOT_A_DESTINATION: frozenset[str] = frozenset({"parking", "fuel", "bank", "office", "lodging", "other"})


def _routine_visits(student: Student, seed: int) -> list[VisitRecord]:
    """Twelve weeks of habit, plus the one-offs. No discoveries yet."""
    rng = random.Random(f"{seed}|{student.key}")
    visits: list[VisitRecord] = []

    for week in range(WEEKS):
        changed = week >= CHANGE_WEEK
        active = [s for s in student.routine if not (changed and s.place in student.retires)]
        if changed:
            active = active + list(student.changes)
        for day in range(7):
            for slot in active:
                if day in slot.days and rng.random() < slot.p:
                    visits.append(_emit(rng, slot, week, day))

    for place in student.one_offs:
        week = rng.randrange(WEEKS)
        day = rng.randrange(7)
        visits.append(_emit(rng, Slot(place, (day,), (10.0, 20.0), (30, 120)), week, day))

    return visits


def _top_categories(visits: Sequence[VisitRecord], n: int = 3) -> list[str]:
    """The student's favourite categories before the cutoff, most-visited first."""
    counts = Counter(
        v.category for v in visits if v.end_ts <= cutoff_ts() and v.category not in NOT_A_DESTINATION
    )
    return [category for category, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]]


def _holdout_visit(rng: random.Random, place_id: int) -> VisitRecord:
    """One visit to `place_id`, somewhere in the held-out weeks."""
    week = rng.randrange(CHANGE_WEEK, WEEKS)
    day = rng.randrange(7)
    start_ts = HISTORY_START_TS + week * WEEK_MS + day * DAY_MS + int(rng.uniform(9.0, 21.0) * HOUR_MS)
    return VisitRecord(
        start_ts=start_ts,
        end_ts=start_ts + rng.randint(25, 110) * MINUTE_MS,
        place_id=place_id,
        category=CATEGORY_BY_ID[place_id],
    )


def _discovery_visits(
    student: Student, own: Sequence[VisitRecord], cohort_counts: Counter[int], seed: int
) -> list[VisitRecord]:
    """
    The new places this student tries in the held-out weeks.

    Drawn from their own top categories, so an interest profile is a usable
    signal -- see the module docstring on why that makes this a floor test
    rather than an accuracy claim.
    """
    rng = random.Random(f"{seed}|{student.key}|discover")
    own_ids = {v.place_id for v in own}
    top = set(_top_categories(own))

    def pool(in_top: bool, known_to_cohort: bool) -> list[int]:
        return sorted(
            p.place_id
            for p in PLACES
            if p.place_id not in own_ids
            and p.category not in NOT_A_DESTINATION
            and (p.category in top) is in_top
            and (cohort_counts[p.place_id] > 0) is known_to_cohort
        )

    n_popular, n_unseen, n_off = DISCOVERY_MIX
    chosen: list[int] = []
    for candidates, count in (
        (pool(in_top=True, known_to_cohort=True), n_popular),
        (pool(in_top=True, known_to_cohort=False), n_unseen),
        (pool(in_top=False, known_to_cohort=False), n_off),
    ):
        available = [p for p in candidates if p not in chosen]
        chosen.extend(rng.sample(available, min(count, len(available))))

    return [_holdout_visit(rng, place_id) for place_id in chosen]


def _gap_visit_records(student: Student, seed: int) -> list[VisitRecord]:
    """Visits to places the OSM extract does not have. Nobody can recommend these."""
    rng = random.Random(f"{seed}|{student.key}|gaps")
    visits = []
    for place_id, week in student.gap_visits:
        day = rng.randrange(7)
        start_ts = HISTORY_START_TS + week * WEEK_MS + day * DAY_MS + int(rng.uniform(18.0, 22.0) * HOUR_MS)
        visits.append(
            VisitRecord(
                start_ts=start_ts,
                end_ts=start_ts + rng.randint(45, 180) * MINUTE_MS,
                place_id=place_id,
                category=CATEGORY_BY_ID[place_id],
            )
        )
    return visits


def _history_for(student: Student, visits: list[VisitRecord], seed: int) -> History:
    return History(
        visits=tuple(_drop_overlaps(visits)),
        places=PLACES,
        meta={
            "synthetic": True,
            "warning": "SYNTHETIC DATA -- NOT REAL LOCATION HISTORY. Do not edit by hand.",
            "generator": "python -m evaluation.make_synthetic_history",
            "seed": seed,
            "student": student.key,
            "about": student.label,
            "weeks": WEEKS,
            "holdout_weeks": HOLDOUT_WEEKS,
            "holdout_cutoff_ts": cutoff_ts(),
            "behaviour_change": [s.place for s in student.changes],
            "retired_at_cutoff": list(student.retires),
            "osm_gap_place_ids": sorted({place_id for place_id, _ in student.gap_visits}),
        },
    )


def generate_all(seed: int = SEED) -> dict[str, History]:
    """
    Build the whole cohort. Same seed, same bytes, always.

    Two passes, because the discoveries depend on the cohort: what counts as
    "somewhere your peers go" cannot be known until everyone's routine exists.
    Only pre-cutoff visits feed those counts, so nothing in the held-out window
    can influence what the fixture puts there.
    """
    routines = {student.key: _routine_visits(student, seed) for student in STUDENTS}
    cohort_counts = Counter(
        visit.place_id
        for visits in routines.values()
        for visit in visits
        if visit.end_ts <= cutoff_ts()
    )
    return {
        student.key: _history_for(
            student,
            routines[student.key]
            + _discovery_visits(student, routines[student.key], cohort_counts, seed)
            + _gap_visit_records(student, seed),
            seed,
        )
        for student in STUDENTS
    }


def generate(student: Student | str, seed: int = SEED) -> History:
    """One student's history. A convenience wrapper: the cohort is built either way."""
    key = student if isinstance(student, str) else student.key
    return generate_all(seed)[key]


DEFAULT_DIR = Path(__file__).parent / "data" / "history"
PRIMARY = DEFAULT_DIR / "student.json"


def main() -> None:
    histories = generate_all()
    for key, history in histories.items():
        path = DEFAULT_DIR / f"{key}.json"
        write_history(path, history)
        seen = {v.place_id for v in history.visits if v.end_ts <= cutoff_ts()}
        new_in_holdout = {v.place_id for v in history.visits if v.start_ts >= cutoff_ts()} - seen
        print(
            f"wrote {len(history.visits):>4d} visits to {path.relative_to(Path.cwd())}"
            f"  ({len(new_in_holdout)} places new in the hold-out window)"
        )


if __name__ == "__main__":
    main()
