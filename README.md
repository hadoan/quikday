# Quik.day

**One Prompt. One Run. Done.**

An open-source AI-powered execution assistant for founders and small teams. Type a goal and Quik.day executes it instantly across your connected apps with logs, undo, and governance.

## Vision

Quik.day is an AI-powered execution assistant for founders and small teams. You type a goal — "Schedule a check-in with Sara tomorrow at 10:00" — and Quik.day executes it instantly across your connected apps with logs, undo, and governance.

## Product Highlights

- **One-prompt execution** — _One prompt → one run._ Post, schedule, DM, or summarize in seconds.
- **BYOK & control** — Uses your API keys and OAuth tokens; short-lived JWTs secure calls.
- **LangChain/Graph reasoning** — A NestJS service orchestrates tools via LangChain with a graph/executor to plan or auto-run tasks.
- **Capability sandbox** — Each run has a scoped token and allow-listed tools.
- **Undo + audit trail** — Every run is logged, idempotent, and reversible.
- **Team policies** — Plan-only vs auto-run, shared runs, telemetry.

## Architecture Overview

**Browser (Vite + React UI)** → **NestJS API** → **BullMQ Workers** → **LangChain/Graph Orchestrator** → **External APIs (X, Slack, Calendar, Notion, CRM)**

- **NestJS API**: Auth, API gateway, validations, rate limits, signed short-lived JWTs for runs.
- **BullMQ**: Queues per run; retries, backoff, concurrency controls.
- **LangChain/Graph**: Tool selection & control flow (PLAN or AUTO modes), deterministic steps, guardrails.
- **Prisma + PostgreSQL**: Runs, tools, tokens, audit logs, policies.
- **Secrets**: BYOK/OAuth tokens stored securely; per-run scoped access.

## Differentiators

- **Immediacy** — Tasks complete in seconds.
- **Depth over breadth** — Fewer integrations, deeply polished.
- **Governance** — Audit, undo, idempotency, policies.
- **Team-ready** — Shared runs, metrics, controlled automation.
- **Model-agnostic** — Works with OpenAI, Azure, Anthropic.

## Core Use Cases (MVP)

1. Draft & schedule posts on X/LinkedIn
2. Schedule calendar events + DM links
3. Summarize Slack threads → Notion
4. Draft follow-up emails → CRM log
5. Generate daily stand-ups or summaries

## Tech Stack

- **Frontend**: Vite + React, Tailwind, shadcn/ui
- **Auth**: OAuth2 / JWT (short-lived run tokens; BYOK)
- **Backend**: NestJS (REST/WS), LangChain + graph/executor
- **Workers**: BullMQ (Redis) for runs & tool calls
- **Database**: Prisma + PostgreSQL
- **Messaging**: HTTP sync for prompts; BullMQ async for execution
- **Telemetry**: PostHog + structured logs
- **Deploy**: Docker → GCP/Azure (Cloud Run, GKE/AKS)

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
- New control-plane settings:
  - `RUN_TOKEN_SECRET` — signing key for per-run JWTs (defaults to `dev-run-token-secret` if omitted).
  - `RUN_TOKEN_ISSUER` — issuer string for scoped run tokens (defaults to `runfast-control-plane`).
  - `RUN_TOKEN_TTL_SEC` — base expiry in seconds for run tokens (default 900 seconds; delays are added automatically).
- Frontend: set `VITE_DATA_SOURCE=live` to stream real runs from the API/WebSocket instead of mock data.

**Quick Start (Docker Compose + Local Dev)**

- Requirements: Node 20+, pnpm, Docker, Docker Compose
- Steps:
  - `cp .env.example .env`
  - `pnpm install`
  - `docker compose up -d db redis`
  - `pnpm db:push` # Push Prisma schema to Postgres
  - `pnpm seed` # Optional: seeds Team id=1 for testing
  - NOTE: avoid resetting the database in dev if you have existing data. Instead create an initial migration (see below).
  - `pnpm dev` # Starts API, packages watchers, and web dev server (via Turbo)

Ports

- API: `http://localhost:3000`
- Web: `http://localhost:8000`
  -- Postgres: `localhost:5432` (user `postgres`, password `pass`, DB `quikday`)
- Redis: `localhost:6379`

**Run Backend Fully in Docker (Optional)**
You can also run the API inside Docker alongside Postgres and Redis.

Option A — Use existing compose file

- Edit `docker-compose.yml` and uncomment the `api` service.
- Build and start:
  - `docker compose up -d --build db redis api`
- Apply schema (once per change):
  - `docker compose exec api pnpm --filter @quikday/api prisma db push`

Option B — Manual image build/run

- Build image:
  - `docker build -t quikday-api -f Dockerfile.api .`
- Run with your env:
  - `docker run --rm --env-file .env --network host quikday-api`
  - Or attach to compose network and link to `db`/`redis` services as needed.

Notes

- The API container expects `DATABASE_URL` and `REDIS_URL` to point at the compose services (e.g., `postgresql://postgres:pass@db:5432/quikday`, `redis://redis:6379`). When running outside compose network, use `localhost`.
- Prisma migrations: this template uses `db push` in dev. For production, prefer `prisma migrate deploy`.
- Prisma migrations: this template uses `db push` in dev for convenience, but to adopt migrations (without resetting or pushing schema that may drop data), create a migration snapshot instead of running destructive resets.
  - Create an initial migration locally without applying it automatically:
    - `pnpm db:migrate:create` # creates a migration file named `init` using current schema (create-only)
  - To apply migrations in dev (only if you want Prisma to manage schema changes):
    - `pnpm db:migrate` # interactive `prisma migrate dev` (creates and applies migrations)
  - For pushing schema changes immediately without migrations:
    - `pnpm db:push` # faster, but may not produce migration files and can be destructive

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

**Running Tests**

- Install deps once with `pnpm install` (already required for dev).
- Agent package unit tests: `pnpm --filter @quikday/agent test`
- Real LLM validation (requires `OPENAI_API_KEY`): `OPENAI_API_KEY=... pnpm --filter @quikday/agent test -- agent.module.real-llm.spec.ts`
- API worker integration tests (focused suite): `pnpm --filter @quikday/api test -- run.processor.spec.ts`
- To exercise the real OpenAI LLM path, set `OPENAI_API_KEY` and rerun the agent tests (the suite skips this check if the key is missing).
- Add `--watch` to either command while iterating locally.

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
- Token encryption (AES‑GCM) using `@quikday/crypto`
- Policy checks (`autoRun`, `requiresApproval`, `canUndo`)
- Undo path and LangGraph checkpointer

**Troubleshooting**

- DB/Redis connection errors: ensure compose services are healthy (`docker compose ps`, `docker compose logs db redis`).
- Kinde auth failures: set `KINDE_BYPASS=true` in `.env` for local dev.
- Prisma client errors: re‑run `pnpm db:push` and restart API.
- Port conflicts: stop existing services or change ports in `docker-compose.yml`.

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding new features, or improving documentation, your help is appreciated.

**Ways to contribute:**

- 🐛 Report bugs and issues
- 💡 Suggest new features or integrations
- 📝 Improve documentation
- 🔧 Submit pull requests

Please feel free to open issues or submit pull requests on our [GitHub repository](https://github.com/hadoan/prompt-run-flow).

## 📄 License

This project is open source and available under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

The AGPL-3.0 ensures that if you run a modified version of this software as a network service, you must make the source code available to users of that service. This promotes collaboration and ensures the software remains free and open.

## 🙏 Acknowledgments

Built with amazing open source technologies:

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [LangChain](https://langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraphjs/) - AI orchestration
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [React](https://react.dev/) - UI library
- [Turborepo](https://turbo.build/repo) - High-performance monorepo build system

---

© 2025 Quik.day. Built with ❤️ by Ha Doan and the open source community.
