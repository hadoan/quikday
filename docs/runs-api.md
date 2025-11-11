All Runs API — Quik.day

- Base: GET/POST under `/runs`
- Auth: Bearer JWT (Kinde); team scoped via `teamId` in token or `x-team-id` header in dev

List Runs

- GET `/runs?page=1&pageSize=25&status=running&status=succeeded&q=Demo&sortBy=createdAt&sortDir=desc`
- Response:
  {
  "items": [ { "id": "...", "title": "...", "status": "running", "createdAt": "...", "createdBy": {"id":1, "name":"...", "avatar": null}, "kind": "action", "source": "api", "stepCount": 2, "approvals": {"required": false}, "undo": {"available": false}, "lastEventAt": "...", "tags": [] } ],
  "page": 1,
  "pageSize": 25,
  "total": 123
  }

Get Run

- GET `/runs/:id`
- Returns full persisted run (prisma Run model) used by the chat/detail view.

Approve/Cancel/Undo

- POST `/runs/:id/approve` body: { "approvedSteps": ["step-1", ...] }
- POST `/runs/:id/cancel`
- POST `/runs/:id/undo`

WebSocket

- Detail stream (existing): `ws /ws/runs/:id` — emits run lifecycle events for a run
- List stream (added): `ws /ws/runs-stream` — emits `{ type: 'runs.upsert', payload: { runId, projection } }` on updates; UI patches the table in place.

RBAC (baseline)

- viewer: list, view detail, stream
- operator: + approve, cancel, undo
- admin: + policy edits (out of scope here)
