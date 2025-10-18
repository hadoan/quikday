/**
 * Integration Layer Entry Point
 * 
 * Import from this file to access the data source layer.
 */

// Main interface and types
export type {
  DataSource,
  UiRunSummary,
  UiPlanStep,
  UiEvent,
  UiMessage,
  UiCredential,
  CreateRunParams,
  DataSourceConfig,
} from './datasources/DataSource';

// Factory function (use this to get active data source)
export { getDataSource, getFeatureFlags, toggleDataSource } from './flags/featureFlags';

// Implementations (rarely imported directly)
export { MockDataSource } from './datasources/MockDataSource';
export { ApiDataSource } from './datasources/ApiDataSource';

// Adapters (for testing)
export {
  adaptRunBackendToUi,
  adaptStepsBackendToUi,
  adaptWsEventToUi,
  adaptCredentialsBackendToUi,
} from './adapters/backendToViewModel';

// WebSocket (for advanced usage)
export { createRunSocket } from './ws/RunSocket';
export type { RunSocket } from './ws/RunSocket';

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
