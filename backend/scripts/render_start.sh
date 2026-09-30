#!/usr/bin/env bash
# Start command for the hosted demo on Render (see render.yaml at the repo root).
# Render's free plan has no background workers, so the job worker runs in this
# same container beside the API.
set -euo pipefail
cd "$(dirname "$0")/.."

# Render hands out postgres(ql)://; SQLAlchemy needs the psycopg 3 driver named.
if [[ -n "${DATABASE_URL:-}" ]]; then
  url="${DATABASE_URL/#postgres:\/\//postgresql://}"
  export ORBIT_DATABASE_URL="${url/#postgresql:\/\//postgresql+psycopg://}"
fi

# Creates the tables, then loads College Station places into a fresh database only.
python scripts/load_osm.py --file data/college-station.osm.json.gz --skip-if-loaded

# Restart the worker if it ever exits, e.g. after a dropped database connection.
(while true; do python -m app.worker || true; sleep 5; done) &

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips '*'
