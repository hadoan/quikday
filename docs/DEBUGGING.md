Debugging (VS Code)

This repository includes shared VS Code debug configs in `.vscode/` so you can debug on any machine after cloning.

Quick start

- Ensure dependencies are installed: `pnpm i`
- Copy envs if needed: `.env` based on `.env.example`
- Start debugging from the Run and Debug panel using:
  - Dev: API (start + attach) — starts `pnpm dev:api` and attaches to port 9229
  - Launch Web (start Vite) — starts `pnpm dev:web` and opens Chrome at `http://localhost:8000`
  - API + Web (dev) — compound to start both
  - Vitest: Agent (all) — runs tests in `packages/agent`
  - TSX: Agent modular-prompt-demo.ts — runs the example script with breakpoints

Notes

- API debug port is 9229 (configured by `apps/api` scripts).
- Tasks are background tasks and will signal “ready” once the service prints its startup line.
- All launch configs load `${workspaceFolder}/.env` automatically.

