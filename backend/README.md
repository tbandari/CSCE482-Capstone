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

## What's next

- Alembic migrations, then a PostGIS `geography` column + GiST index on points.
- The self-hosted OpenStreetMap place index and `/places/resolve`.
- Rate limits on ingest and export.
