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
| `POST` | `/visits/recompute` | Re-run noise filter + stay detection over every point, then resolve places |
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

`POST /visits/recompute` walks the user's visits in time order. For each one it
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
While `app/ml/places.py` / `interests.py` are not merged, `tests/fake_ml.py` stands
in for them. After they merge the suite runs against the real models, and that file
and the `_ml_fallback` fixture in `conftest.py` can be deleted.

## Layout

```
app/
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

## What's next

- Alembic migrations, then PostGIS `geography` columns + GiST indexes on points
  and places (`ST_DWithin` replaces the bounding-box prefilter in `places/queries.py`).
- Recommendation endpoints on top of the profile (Month 2, Part 2).
- Per-visit time zones for opening hours.
- Rate limits on ingest and export.
