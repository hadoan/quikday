# Runfast Monorepo

A minimal yet production‑ready monorepo with a NestJS backend, LangGraph execution engine, shared TypeScript packages, and a Vite React frontend.

- Backend: NestJS (REST), Prisma (PostgreSQL), BullMQ (Redis), PostHog telemetry, Kinde JWT guard (dev bypass supported)
- AI Engine: LangChain + LangGraph (JS) with a simple social posting graph
- Shared: Zod‑typed chat blocks (`@runfast/types`), AES‑GCM crypto helpers (`@runfast/crypto`), thin SDK (`@runfast/sdk`)
- DX: pnpm + Turbo, Dockerfiles, and docker‑compose for DB/Redis


**Repo Layout**
- `apps/api` — NestJS backend (Prisma, BullMQ, Kinde Guard, LangGraph)
- `apps/web` — Vite React app (example UI; bring your own auth integration)
- `packages/types` — Zod schemas for chat blocks and run types
- `packages/crypto` — AES‑GCM helpers for BYOK
- `packages/sdk` — Small fetch wrapper for API calls
- Root configs: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `docker-compose.yml`, `Dockerfile.api`, `Dockerfile.web`


**Environment**
- Copy `.env.example` to `.env` and fill values. For local dev, `KINDE_BYPASS=true` lets you skip JWT validation.
- Postgres and Redis run via Docker Compose.


**Quick Start (Docker Compose + Local Dev)**
- Requirements: Node 20+, pnpm, Docker, Docker Compose
- Steps:
  - `cp .env.example .env`
  - `pnpm install`
  - `docker compose up -d db redis`
  - `pnpm db:push`  # Push Prisma schema to Postgres
  - `pnpm seed`     # Optional: seeds Team id=1 for testing
  - `pnpm dev`      # Starts API, packages watchers, and web dev server (via Turbo)

Ports
- API: `http://localhost:3000`
- Web: `http://localhost:8000`
- Postgres: `localhost:5432` (user `postgres`, password `pass`, DB `runfast`)
- Redis: `localhost:6379`


**Run Backend Fully in Docker (Optional)**
You can also run the API inside Docker alongside Postgres and Redis.

Option A — Use existing compose file
- Edit `docker-compose.yml` and uncomment the `api` service.
- Build and start:
  - `docker compose up -d --build db redis api`
- Apply schema (once per change):
  - `docker compose exec api pnpm --filter @runfast/api prisma db push`

Option B — Manual image build/run
- Build image:
  - `docker build -t runfast-api -f Dockerfile.api .`
- Run with your env:
  - `docker run --rm --env-file .env --network host runfast-api`
  - Or attach to compose network and link to `db`/`redis` services as needed.

Notes
- The API container expects `DATABASE_URL` and `REDIS_URL` to point at the compose services (e.g., `postgresql://postgres:pass@db:5432/runfast`, `redis://redis:6379`). When running outside compose network, use `localhost`.
- Prisma migrations: this template uses `db push` in dev. For production, prefer `prisma migrate deploy`.


**API Smoke Test**
With `KINDE_BYPASS=true`, you can use any bearer token locally:
- Plan mode (returns [plan, config]):
  - `curl -sS -X POST http://localhost:3000/chat/complete \
    -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
    -d '{"prompt":"schedule something","mode":"plan","teamId":1}' | jq` 
- Auto mode (queues run and returns [plan, config, run]):
  - `curl -sS -X POST http://localhost:3000/chat/complete \
    -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
    -d '{"prompt":"schedule something","mode":"auto","teamId":1}' | jq`
- Fetch run by id:
  - `curl -sS -H "Authorization: Bearer dev" http://localhost:3000/runs/<RUN_ID> | jq`


**Common Commands**
- `pnpm db:push` — Push Prisma schema to DB
- `pnpm db:migrate` — Create dev migration (interactive)
- `pnpm seed` — Seed sample team (id=1)
- `pnpm dev` — Run dev tasks across workspaces via Turbo
- `pnpm build` — Build all packages/apps
- `pnpm up` — `docker compose up -d db redis` then run dev


**What’s Implemented**
- Endpoints:
  - `POST /chat/complete` — returns [plan, config] (plan) or [plan, config, run] (auto)
  - `POST /runs` — create run
  - `POST /runs/:id/confirm` — enqueue run execution
  - `POST /runs/:id/undo` — TODO stub
  - `GET /runs/:id` — fetch run + steps
  - `GET /teams/:id/policies`, `GET /teams/:id/integrations` — simple lookups
- Queue: BullMQ queue `runs`, job `execute`
- Engine: LangGraph based minimal social graph
- Telemetry: PostHog events `run_created`, `run_done`, `run_failed`


**TODO / Stretch**
- OAuth for providers under `/integrations`
- Token encryption (AES‑GCM) using `@runfast/crypto`
- Policy checks (`autoRun`, `requiresApproval`, `canUndo`)
- Undo path and LangGraph checkpointer


**Troubleshooting**
- DB/Redis connection errors: ensure compose services are healthy (`docker compose ps`, `docker compose logs db redis`).
- Kinde auth failures: set `KINDE_BYPASS=true` in `.env` for local dev.
- Prisma client errors: re‑run `pnpm db:push` and restart API.
- Port conflicts: stop existing services or change ports in `docker-compose.yml`.
