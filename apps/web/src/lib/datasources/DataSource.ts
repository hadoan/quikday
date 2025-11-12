/**
 * @deprecated This file has been moved to @/apis/runs
 * Please update your imports to use @/apis/runs instead
 *
 * This file is kept for backward compatibility only
 */

// Re-export all types from the new location
export type {
  UiRunStatus,
  UiStepStatus,
  UiMessageRole,
  UiMessageType,
  UiRunSummary,
  UiPlanStep,
  ApiPlanStep,
  UiMessage,
  UiMessageData,
  UiPlanData,
  UiRunData,
  UiLogData,
  UiOutputData,
  UiOutputDataPresentation,
  UiParamsData,
  UiUndoData,
  UiQuestionItem,
  UiQuestionsData,
  UiConfigData,
  UiErrorData,
  UiAppCredentialsData,
  UiEventType,
  UiEvent,
  UiCredential,
  CreateRunParams,
  RunApiConfig as DataSourceConfig,
} from '@/apis/runs';

// Backward compatibility: DataSource interface is now RunApiClient
export type { RunApiClient as DataSource } from '@/apis/runs';
