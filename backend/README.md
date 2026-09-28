# Orbit API

FastAPI service for accounts, location ingest, visit detection, place resolution
against a self-hosted OpenStreetMap index, the interest profile and full export.
SQLite by default so it runs with zero setup; PostgreSQL + PostGIS via Docker for
anything real.

## Run it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
# In a second terminal
python -m app.worker
```

Interactive docs: http://127.0.0.1:8000/docs

> **Schema changed in Month 2 (places, visit places, interest overrides).** The app
> still uses `create_all`, which never alters existing tables, so delete your local
> database once after pulling: `rm orbit-dev.db` (or `docker compose down -v` for
> Postgres). Alembic migrations replace this in Part 2.

## Load places

Place resolution only uses our own copy of OpenStreetMap, so load one before
recomputing visits:

```bash
# College Station + Texas A&M, downloaded once from the public Overpass API
python scripts/load_osm.py --bbox 30.57,-96.39,30.66,-96.28 --save cstat.json
# or re-load a saved extract (idempotent: upserts by osm_id)
python scripts/load_osm.py --file cstat.json
```

Only the bounding box is sent to Overpass. No user data ever leaves the server.

To use PostgreSQL instead of the SQLite file:

```bash
docker compose up -d db
cp .env.example .env            # ORBIT_DATABASE_URL points at the container
uvicorn app.main:app --reload
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account, returns a bearer token |
| `POST` | `/auth/login` | Exchange email + password for a token |
| `GET` | `/auth/me` | The current account |
| `DELETE` | `/auth/me` | Hard delete: account, points and visits |
| `POST` | `/locations/batch` | Idempotent ingest of up to 5,000 points |
| `GET` | `/locations` | Points in a time range (`from_ts`, `to_ts`, `limit`) |
| `GET` | `/locations/stats` | Counts and first/last timestamps |
| `GET` | `/visits` | Detected visits, newest first |
| `POST` | `/visits/recompute` | Queue a recompute and return `202` with a job id |
| `GET` | `/jobs/{job_id}` | Read the current user's queued, running, done or failed job |
| `GET` | `/places/nearby` | Places around `lat`/`lon` (`radius_m` ≤ 5000, `category`, `limit`), nearest first |
| `GET` | `/profile` | Interest profile: category weights and top places |
| `PATCH` | `/profile/interests/{category}` | `{"hidden": true}` hides a category everywhere, `false` restores it |
| `GET` | `/export` | Everything the account owns, as JSON |
| `GET` | `/health` | Liveness |

All routes except `/health`, `/auth/register` and `/auth/login` need
`Authorization: Bearer <token>`.

Timestamps are epoch milliseconds (UTC) everywhere, matching the app.

## Configuration

Environment variables (or a `.env` file), all prefixed `ORBIT_`:

| Variable | Default | Notes |
| --- | --- | --- |
| `ORBIT_DATABASE_URL` | `sqlite:///./orbit-dev.db` | Any SQLAlchemy URL; use `postgresql+psycopg://…` for Postgres |
| `ORBIT_JWT_SECRET` | dev-only value | Must be a long random string in any deployment |
| `ORBIT_JWT_TTL_SECONDS` | 30 days | Token lifetime |
| `ORBIT_MAX_BATCH_SIZE` | 5000 | Max points per ingest call |
| `ORBIT_PLACE_SEARCH_RADIUS_M` | 50 | Places within this distance of a visit are ranked |
| `ORBIT_PLACE_MIN_CONFIDENCE` | 0.35 | A visit gets a place only if the top candidate clears this |
| `ORBIT_PLACE_TIMEZONE` | `America/Chicago` | Local time for opening hours |

## Place resolution

The worker handles each queued recompute outside the API request. Run it with
`python -m app.worker`, or use `python -m app.worker --once` to process at most
one queued job during development and tests. A failed job is retried up to three
times and records its last error. Repeated queued recomputes for the same user are
coalesced into one job.

The recompute job walks the user's visits in time order. For each one it
takes the places within `ORBIT_PLACE_SEARCH_RADIUS_M`, asks the ranker
(`app.ml.places.rank_candidates`) to score them, and assigns the best one if its
confidence clears `ORBIT_PLACE_MIN_CONFIDENCE`. Otherwise the visit stays
unresolved. How often each place was already chosen is passed along, because
revisits are strong evidence. `GET /profile` feeds the resolved visits to
`app.ml.interests.build_interest_profile`. Both models live in `app/ml/` and share
the dataclasses in `app/ml/types.py`.

The API loads the models lazily (`app/places/ml.py`). Until they are installed,
recompute still detects visits but resolves none, and `/profile` answers 503.

## Tests

```bash
python -m pytest -q
```

Tests run against an in-memory SQLite database, so they need no services.
`tests/fixtures/overpass-sample.json` is a small handmade extract around Texas A&M.
Most tests run against the real models in `app/ml/`. The profile tests pin the
simple nearest-place ranker in `tests/rankers.py`, because they check the API, not
ranking quality.

## Layout

```
app/
  jobs/           durable queue, recompute handler and job status route
  worker.py       polling worker entry point
  main.py         app factory, CORS, /health
  config.py       settings
  db.py           engine/session factory (SQLite + Postgres)
  models.py       users, location_points, visits, places, interest_overrides
  schemas.py      request/response models
  security.py     scrypt password hashing, JWT
  deps.py         DB session + current-user dependencies
  stays.py        noise filter + stay detection (port of the app's src/lib/stays)
  ml/             place ranker + interest model (types.py is the shared contract)
  places/         OSM categories, loader, spatial queries, visit resolution
  routers/        auth, locations, visits, places, profile, export
scripts/
  load_osm.py     load an Overpass extract into the places table
tests/
```

## Place resolution & interests

`app/ml/` is a small, dependency-free package (standard library only) shared by
the API, the evaluation harness and the app. Nothing in it touches the database
or the network, so it can be tested and tuned in isolation.

- `types.py` — the shared dataclasses (`VisitFeatures`, `PlaceCandidate`,
  `ScoredCandidate`, `InterestWeight`) and the `CATEGORIES` tuple. Identical
  copy in three places by convention (see `README.md`); don't edit without
  telling the team.
- `opening_hours.py` — a small parser for the common OSM `opening_hours` subset
  (`24/7`, `off`, `Mo-Fr 07:00-22:00; Sa,Su 09:00-20:00`, comma day/time lists).
  Anything outside that subset resolves to `"unknown"` rather than raising.
- `places.py` — `rank_candidates(visit, candidates, revisit_counts, tz)` scores
  each candidate as a weighted sum of features and returns them best-first:
  - **Distance**: Gaussian log-likelihood decay (`DISTANCE_SIGMA_M`) around the
    visit centroid, with an extra flat `DISTANCE_PENALTY` past
    `DISTANCE_PENALTY_RADIUS_M` (30 m, per the proposal).
  - **Dwell fit**: how well the visit's duration matches a per-category typical
    range in `DWELL_MINUTES_BY_CATEGORY`; unlisted categories score neutral.
  - **Opening hours**: the visit midpoint is converted to local time
    (`zoneinfo.ZoneInfo(tz)`) and checked against `opening_hours.status_at`;
    open/closed give `HOURS_OPEN_BONUS`/`-HOURS_CLOSED_PENALTY`, unknown is
    neutral.
  - **Revisits**: `log1p(revisit_counts[place_id])`, weighted by `W_REVISIT`.
  - **Category prior**: a small penalty (`CATEGORY_PRIOR_PENALTY`) for
    `parking`, `fuel` and `other`, which are rarely the real destination.

  Confidence is a softmax over the candidates' scores plus a fixed
  `NONE_OF_THESE_SCORE` option, so a single low-scoring candidate still reads as
  low-confidence instead of winning by default. All the `W_*`, `*_SIGMA_M`,
  `*_PENALTY*` and `*_BONUS` names are module-level constants at the top of
  `places.py` — tune them there.
- `interests.py` — `build_interest_profile(visits, hidden, now_ts,
  half_life_days)` sums `sqrt(dwell_minutes) * 0.5 ** (age_days /
  half_life_days)` per category, drops `EXCLUDED_CATEGORIES` (parking, fuel,
  bank, office, lodging, other) entirely, and normalizes the non-hidden weights
  to sum to 1. Hidden categories stay in the output with `weight=0.0` so the UI
  can still list and un-hide them.

## What's next

- Alembic migrations, then PostGIS `geography` columns + GiST indexes on points
  and places (`ST_DWithin` replaces the bounding-box prefilter in `places/queries.py`).
- Recommendation endpoints on top of the profile (Month 2, Part 2).
- Per-visit time zones for opening hours.
- Rate limits on ingest and export.
