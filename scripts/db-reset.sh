#!/usr/bin/env bash
set -euo pipefail

# db-reset.sh
# Usage: ./scripts/db-reset.sh
# Stops compose, removes volumes, starts DB+Redis, waits for Postgres, pushes schema and runs seed.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Stopping compose and removing volumes..."
docker compose down -v

echo "Starting DB and Redis..."
docker compose up -d db redis

echo "Waiting for Postgres to accept connections..."
RETRIES=60
SLEEP=1
for i in $(seq 1 $RETRIES); do
  # Use docker exec to run pg_isready inside the db container; fall back to sleep if not available
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    echo "Postgres is ready"
    break
  fi
  if [ $i -eq $RETRIES ]; then
    echo "Timed out waiting for Postgres" >&2
    exit 1
  fi
  sleep $SLEEP
done

echo "Applying Prisma schema (db push)..."
pnpm db:push

echo "Running seed script..."
pnpm seed

echo "DB reset complete."
