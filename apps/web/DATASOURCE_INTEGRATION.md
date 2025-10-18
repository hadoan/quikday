# Data Source Integration Layer

## Overview

The Data Source Integration Layer provides a thin **adapter** pattern between the UI and backend, allowing seamless switching between **mock** and **live** data sources without modifying UI components.

### Key Principles

✅ **No UI Changes** — Component props remain identical  
✅ **Feature Flags** — Runtime toggle between mock/live  
✅ **Stable Contracts** — `DataSource` interface guarantees consistency  
✅ **Pure Adapters** — Testable transformation functions  
✅ **QA Friendly** — Side-by-side comparison of mock vs live  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│  (React Components - NO CHANGES TO PROPS)                   │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Uses DataSource interface
             │
┌────────────▼────────────────────────────────────────────────┐
│                   DataSource Interface                       │
│  - createRun()                                               │
│  - getRun()                                                  │
│  - connectRunStream()                                        │
│  - approve() / cancel() / undo()                             │
│  - listCredentials()                                         │
└─────────┬────────────────────────────────────────────┬──────┘
          │                                             │
          │                                             │
┌─────────▼──────────┐                     ┌───────────▼───────┐
│  MockDataSource    │                     │  ApiDataSource    │
│  - Uses mockRuns   │                     │  - REST calls     │
│  - Simulates events│                     │  - WebSocket      │
│  - Instant response│                     │  - Uses adapters  │
└────────────────────┘                     └───────┬───────────┘
                                                   │
                                         ┌─────────▼────────────┐
                                         │ Adapter Functions    │
                                         │ - adaptRunToUi()     │
                                         │ - adaptStepsToUi()   │
                                         │ - adaptWsEventToUi() │
                                         └──────────────────────┘
                                                   │
                                         ┌─────────▼────────────┐
                                         │  Backend API         │
                                         │  - POST /runs        │
                                         │  - GET /runs/:id     │
                                         │  - WS /ws/runs/:id   │
                                         └──────────────────────┘
```

---

## File Structure

```
apps/web/src/lib/
├── datasources/
│   ├── DataSource.ts          # Interface + view model types
│   ├── MockDataSource.ts      # Wraps existing mockRuns
│   └── ApiDataSource.ts       # Calls REST + WS with adapters
├── adapters/
│   └── backendToViewModel.ts  # Pure transformation functions
├── ws/
│   └── RunSocket.ts           # WebSocket wrapper with auto-reconnect
├── flags/
│   └── featureFlags.ts        # Data source switching + runtime toggle
├── telemetry/
│   └── telemetry.ts           # Event tracking (preserved names)
└── testing/
    └── fixtures/
        ├── mock.run.fixture.ts     # Golden UI fixture
        ├── backend.run.fixture.ts  # Golden backend fixture
        └── index.ts
```

---

## Usage

### 1. Environment Variables

Set in `.env` or `.env.local`:

```bash
# Data source: 'mock' (default) or 'live'
VITE_DATA_SOURCE=mock

# API endpoints (for live mode)
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_BASE_URL=ws://localhost:3000
```

### 2. Runtime Override (Dev/QA)

Override via query params:

```
# Use live data source
http://localhost:5173?ds=live

# Use mock data source
http://localhost:5173?ds=mock

# Enable debug info + live features
http://localhost:5173?ds=live&ff=debug,live-approvals
```

### 3. Programmatic Usage

```typescript
import { getDataSource } from '@/lib/flags/featureFlags';

const dataSource = getDataSource();

// Create run
const { runId } = await dataSource.createRun({
  prompt: 'Schedule a meeting with Sara',
  mode: 'auto',
});

// Connect to WebSocket for updates
const stream = dataSource.connectRunStream(runId, (event) => {
  console.log('Event:', event);
});

// Clean up
stream.close();
```

---

## Data Flow

### Creating a Run

```
User types prompt
    │
    ▼
Index.tsx: handleNewPrompt()
    │
    ▼
dataSource.createRun()
    │
    ├─ MockDataSource: Return mock runId, emit fake events
    │
    └─ ApiDataSource: POST /runs → backend → return real runId
```

### Receiving Updates

```
WebSocket message arrives
    │
    ▼
RunSocket.handleMessage()
    │
    ▼
adaptWsEventToUi()  ← Transform backend format to UI format
    │
    ▼
onEvent callback
    │
    ▼
Index.tsx: Update state → UI re-renders
```

---

## View Model Contracts

All data sources return identical view models that match current UI props:

### `UiRunSummary`

```typescript
{
  id: string;
  prompt: string;
  status: 'queued' | 'planning' | 'executing' | 'succeeded' | 'failed' | ...;
  timestamp: string;
  messages?: UiMessage[];
  links?: Array<{ provider: string; url: string; externalId: string }>;
}
```

### `UiPlanStep`

```typescript
{
  id: string;
  tool: string;
  action?: string;
  status: 'pending' | 'started' | 'succeeded' | 'failed' | 'skipped';
  time?: string;
  inputsPreview?: string;
  outputsPreview?: string;
  errorCode?: string;
  errorMessage?: string;
}
```

### `UiEvent` (WebSocket)

```typescript
{
  type: 'plan_generated' | 'step_started' | 'step_succeeded' | ...;
  payload: Record<string, unknown>;
  ts: string;
  runId?: string;
}
```

---

## Adapter Functions

Located in `lib/adapters/backendToViewModel.ts`. These are **pure functions** (no side effects).

### `adaptRunBackendToUi(backend) → UiRunSummary`

Converts backend `Run` object to UI view model.

- Maps status codes (e.g., `'completed'` → `'succeeded'`)
- Normalizes dates to ISO strings
- Extracts links from `effects[]`

### `adaptStepsBackendToUi(steps) → UiPlanStep[]`

Converts backend `Step[]` to UI plan steps.

- Generates preview strings from request/response
- Calculates time labels from timestamps
- Maps status codes

### `adaptWsEventToUi(message) → UiEvent`

Converts WebSocket message to UI event.

- Normalizes event types
- Preserves raw message in `payload._raw` for debugging
- Handles ping/pong and JSON parsing

---

## Feature Flags

### Available Flags

| Flag                | Description                           | Default |
| ------------------- | ------------------------------------- | ------- |
| `dataSource`        | `'mock'` or `'live'`                  | `mock`  |
| `liveApprovals`     | Enable live approval flow             | `false` |
| `liveUndo`          | Enable live undo operations           | `false` |
| `liveCredentials`   | Enable live credential management     | `false` |
| `showDebugInfo`     | Log feature flags and data source     | `false` |

### Toggle at Runtime

```typescript
import { toggleDataSource, updateFeatureFlags } from '@/lib/flags/featureFlags';

// Toggle between mock and live
const newSource = toggleDataSource();

// Enable specific features
updateFeatureFlags({ liveApprovals: true, showDebugInfo: true });
```

---

## WebSocket (`RunSocket`)

### Features

- ✅ Auto-reconnect with exponential backoff + jitter
- ✅ Heartbeat pings (every 30s)
- ✅ Event adaptation via `adaptWsEventToUi()`
- ✅ Single `onEvent` callback

### Usage

```typescript
import { createRunSocket } from '@/lib/ws/RunSocket';

const socket = createRunSocket({
  wsBaseUrl: 'ws://localhost:3000',
  runId: 'R-123',
  authToken: 'Bearer xyz',
  onEvent: (event) => console.log('Event:', event),
  onError: (error) => console.error('Error:', error),
  onClose: () => console.log('Closed'),
});

// Later
socket.close();
```

---

## Telemetry

Telemetry events are **preserved** with identical names:

- `ds_active` — Logged on page load with current data source
- `chat_sent` — User submits prompt
- `run_queued` — Run created and queued
- `plan_generated` — Plan generated with step count
- `approval_required` — Awaiting user approval
- `approval_granted` — User approved steps
- `step_started` / `step_succeeded` / `step_failed`
- `run_completed` — Run finished with status

### Usage

```typescript
import { trackDataSourceActive, trackChatSent } from '@/lib/telemetry/telemetry';

trackDataSourceActive('live');
trackChatSent({ mode: 'auto', hasSchedule: false, targetsCount: 1 });
```

---

## Testing

### Golden Fixtures

Located in `lib/testing/fixtures/`:

- **`mock.run.fixture.ts`** — What UI expects (from MockDataSource)
- **`backend.run.fixture.ts`** — What backend returns (for adapter tests)

### Snapshot Tests (Recommended)

```typescript
import { adaptRunBackendToUi } from '@/lib/adapters/backendToViewModel';
import { backendRunFixture } from '@/lib/testing/fixtures';

test('adapter produces consistent UI view model', () => {
  const uiRun = adaptRunBackendToUi(backendRunFixture);
  expect(uiRun).toMatchSnapshot();
  expect(uiRun.status).toBe('succeeded');
  expect(uiRun.id).toBe('R-1001');
});
```

### Manual QA Checklist

1. ✅ **Flag=mock** → App behaves like before
2. ✅ **Flag=live** → Same UI, real data
3. ✅ Create run → WebSocket events update UI
4. ✅ Approval flow works (if enabled)
5. ✅ Missing credentials → Banner appears
6. ✅ Scheduled runs → Badge renders
7. ✅ Dark mode, keyboard shortcuts, scroll work

---

## Migration Steps (Done ✅)

1. ✅ Add `DataSource` interface + `MockDataSource` (wraps existing mocks)
2. ✅ Add feature flag with default `mock`
3. ✅ Add `ApiDataSource` (REST only) with adapters
4. ✅ Add `RunSocket` + WS path + event adaptation
5. ✅ Wire Composer to `dataSource.createRun()`
6. ✅ Add telemetry `ds_active` event
7. ✅ Add environment variables to `.env.example`
8. ✅ Document usage and QA checklist

---

## Troubleshooting

### Issue: "Run not updating in UI"

**Check:**
- Is data source set to `live`? (`?ds=live`)
- Is WebSocket connected? (check browser console)
- Is backend running and reachable?

**Debug:**
```typescript
import { logFeatureFlagsInfo } from '@/lib/flags/featureFlags';
logFeatureFlagsInfo();
```

### Issue: "Type errors in components"

**Solution:** The integration layer uses `as any` in a few places to bridge the gap between mock data types and UI view models. This is intentional and safe because:

1. `MockDataSource` wraps existing `mockRuns` (known good data)
2. `ApiDataSource` uses adapters that guarantee the same shape
3. Components already work with the mock data

### Issue: "WebSocket not reconnecting"

**Check:**
- Network tab in DevTools
- Backend WebSocket handler is implemented
- Auth token is valid

**Debug:**
```typescript
// Enable debug logs
const socket = createRunSocket({
  ...config,
  onError: (err) => console.error('[WS Error]', err),
  onClose: () => console.log('[WS Closed]'),
});
```

---

## Next Steps

### Phase 1: Current (✅ Done)
- Mock and live data sources working
- Feature flag toggle
- WebSocket with auto-reconnect
- Telemetry tracking

### Phase 2: Future Enhancements
- Add unit tests for adapters
- Add snapshot tests with golden fixtures
- Implement `listRuns()` for sidebar
- Add live approval flow (when backend ready)
- Add live undo flow (when backend ready)
- Add PostHog integration for production telemetry
- Add error boundary for graceful fallback
- Add loading states and optimistic updates

### Phase 3: Production Readiness
- E2E tests with Playwright
- Performance monitoring
- Error tracking (Sentry)
- Load testing WebSocket
- Documentation for new integrations
- CI/CD pipeline checks

---

## Contributing

When adding new features:

1. **Update the interface** in `DataSource.ts`
2. **Implement in both** `MockDataSource` and `ApiDataSource`
3. **Add adapter** if backend shape differs
4. **Preserve telemetry** event names
5. **Test both** mock and live modes
6. **Document** in this README

---

## License

Part of Quik.day — AGPL-3.0

Built with ❤️ by the Quik.day team
