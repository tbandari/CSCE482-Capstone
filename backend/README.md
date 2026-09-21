# Orbit API

FastAPI service for accounts, location ingest, visit detection and full export.
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
| `POST` | `/visits/recompute` | Re-run noise filter + stay detection over every point |
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

## Tests

```bash
python -m pytest -q
```

Tests run against an in-memory SQLite database, so they need no services.

## Layout

```
app/
  main.py         app factory, CORS, /health
  config.py       settings
  db.py           engine/session factory (SQLite + Postgres)
  models.py       users, location_points, visits
  schemas.py      request/response models
  security.py     scrypt password hashing, JWT
  deps.py         DB session + current-user dependencies
  stays.py        noise filter + stay detection (port of the app's src/lib/stays)
  routers/        auth, locations, visits, export
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

- Alembic migrations, then a PostGIS `geography` column + GiST index on points.
- The self-hosted OpenStreetMap place index and `/places/resolve`.
- Rate limits on ingest and export.
