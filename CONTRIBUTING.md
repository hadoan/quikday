# Contributing to Runfast.now

**One Prompt. One Run. Done.**

Thank you for your interest in contributing to Runfast! We welcome contributions from the community.

## Vision

Runfast is an AI-powered execution assistant for founders and small teams. You type a goal — "Schedule a check-in with Sara tomorrow at 10:00" — and Runfast executes it instantly across your connected apps with logs, undo, and governance.

## Product Highlights

* **One-prompt execution** — *One prompt → one run.* Post, schedule, DM, or summarize in seconds.
* **BYOK & control** — Uses your API keys and OAuth tokens; short-lived JWTs secure calls.
* **LangChain/Graph reasoning** — A NestJS service orchestrates tools via LangChain with a graph/executor to plan or auto-run tasks.
* **Capability sandbox** — Each run has a scoped token and allow-listed tools.
* **Undo + audit trail** — Every run is logged, idempotent, and reversible.
* **Team policies** — Plan-only vs auto-run, shared runs, telemetry.

## Architecture Overview

**Browser (Vite + React UI)** → **NestJS API** → **BullMQ Workers** → **LangChain/Graph Orchestrator** → **External APIs (X, Slack, Calendar, Notion, CRM)**

* **NestJS API**: Auth, API gateway, validations, rate limits, signed short-lived JWTs for runs.
* **BullMQ**: Queues per run; retries, backoff, concurrency controls.
* **LangChain/Graph**: Tool selection & control flow (PLAN or AUTO modes), deterministic steps, guardrails.
* **Prisma + PostgreSQL**: Runs, tools, tokens, audit logs, policies.
* **Secrets**: BYOK/OAuth tokens stored securely; per-run scoped access.

## Differentiators

* **Immediacy** — Tasks complete in seconds.
* **Depth over breadth** — Fewer integrations, deeply polished.
* **Governance** — Audit, undo, idempotency, policies.
* **Team-ready** — Shared runs, metrics, controlled automation.
* **Model-agnostic** — Works with OpenAI, Azure, Anthropic.

## Core Use Cases (MVP)

1. Draft & schedule posts on X/LinkedIn
2. Schedule calendar events + DM links
3. Summarize Slack threads → Notion
4. Draft follow-up emails → CRM log
5. Generate daily stand-ups or summaries

## Tech Stack

* **Frontend**: Vite + React, Tailwind, shadcn/ui
* **Auth**: OAuth2 / JWT (short-lived run tokens; BYOK)
* **Backend**: NestJS (REST/WS), LangChain + graph/executor
* **Workers**: BullMQ (Redis) for runs & tool calls
* **Database**: Prisma + PostgreSQL
* **Messaging**: HTTP sync for prompts; BullMQ async for execution
* **Telemetry**: PostHog + structured logs
* **Deploy**: Docker → GCP/Azure (Cloud Run, GKE/AKS)

## How to Contribute

### Ways to Contribute

- 🐛 **Report bugs** — Open an issue with detailed reproduction steps
- 💡 **Suggest features** — Propose new integrations or capabilities
- 📝 **Improve documentation** — Fix typos, add examples, clarify instructions
- 🔧 **Submit pull requests** — Fix bugs or implement new features
- 🎨 **Enhance UI/UX** — Improve the frontend experience
- 🔌 **Add integrations** — Build new app integrations following our plugin architecture

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/hadoan/runfast.git
   cd runfast
   ```
3. **Set up the development environment** (see README.md for detailed instructions):
   ```bash
   cp .env.example .env
   pnpm install
   docker compose up -d db redis
   pnpm db:push
   pnpm dev
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes** and commit with clear messages
6. **Push to your fork** and submit a pull request

### Code Guidelines

- Follow the existing code style and conventions
- Write clear, descriptive commit messages
- Add tests for new features when applicable
- Update documentation as needed
- Ensure all tests pass before submitting PR
- Keep PRs focused on a single feature or fix

### Pull Request Process

1. Update the README.md or relevant documentation with details of changes
2. Ensure your code follows the project's coding standards
3. Make sure all tests pass and there are no linting errors
4. Request review from maintainers
5. Address any feedback or requested changes
6. Once approved, your PR will be merged

### Development Workflow

- **API Development**: Work in `apps/api/src/`
- **Frontend Development**: Work in `apps/web/src/`
- **Shared Packages**: Work in `packages/`
- **Integrations**: Add new integrations in `packages/appstore/`
- **Database Changes**: Update Prisma schema and run migrations

### Testing

```bash
# Run API tests
pnpm --filter @runfast/api test

# Run web tests
pnpm --filter @runfast/web test

# Build all packages
pnpm build
```

### Need Help?

- Open an issue for questions or discussions
- Check existing issues and PRs to avoid duplicates
- Review the [README.md](README.md) for setup instructions
- Join our community discussions (if applicable)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a welcoming environment for all contributors

## License

By contributing to Runfast, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

The AGPL-3.0 ensures that if you run a modified version of this software as a network service, you must make the source code available to users of that service.

---

© 2025 Runfast. Built with ❤️ by Ha Doan and the open source community.
