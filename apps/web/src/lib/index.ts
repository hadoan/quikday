/**
 * Integration Layer Entry Point
 *
 * Import from this file to access the data source layer.
 * NOTE: Most run-related types and functions have been moved to @/apis/runs
 */

// Main interface and types (re-exported from new location)
export type {
  UiRunSummary,
  UiPlanStep,
  UiEvent,
  UiMessage,
  UiCredential,
  CreateRunParams,
  RunApiConfig as DataSourceConfig,
} from '@/apis/runs';

// Backward compatibility type alias
export type { RunApiClient as DataSource } from '@/apis/runs';

// Factory function (use this to get active data source)
export { getDataSource, getFeatureFlags, toggleDataSource } from './flags/featureFlags';

// Implementations (rarely imported directly)
export { RunApiClient as ApiDataSource } from '@/apis/runs';

// Adapters (for testing)
export {
  adaptRunBackendToUi,
  adaptStepsBackendToUi,
  adaptWsEventToUi,
  adaptCredentialsBackendToUi,
} from './adapters/backendToViewModel';

// WebSocket (for advanced usage)
export { createRunSocket } from '@/apis/runs';
export type { RunSocket } from '@/apis/runs';

// Telemetry
export {
  trackDataSourceActive,
  trackChatSent,
  trackRunQueued,
  trackPlanGenerated,
  trackApprovalRequired,
  trackApprovalGranted,
  trackStepStarted,
  trackStepSucceeded,
  trackStepFailed,
  trackRunCompleted,
} from './telemetry/telemetry';

// Test fixtures (for tests)
export * from './testing/fixtures';
