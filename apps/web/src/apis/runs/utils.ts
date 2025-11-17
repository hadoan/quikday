/**
 * Utility functions for Run API operations
 * Helper functions for common run-related tasks
 */

import type { Question } from '@/components/chat/QuestionsPanel';
import { getApiBaseUrl } from '@/apis/client';
import { RunApiClient } from './client';

/**
 * Normalize question type from backend string to QuestionsPanel Question type
 */
export function normalizeQuestionType(t?: string): Question['type'] {
  const v = String(t || 'text').toLowerCase();
  if (v === 'textarea') return 'textarea';
  if (v === 'email') return 'email';
  if (v === 'email_list' || v === 'email-list') return 'email_list';
  if (v === 'datetime' || v === 'date_time' || v === 'date-time') return 'datetime';
  if (v === 'date') return 'date';
  if (v === 'time') return 'time';
  if (v === 'number' || v === 'numeric') return 'number';
  if (v === 'select') return 'select';
  if (v === 'multiselect' || v === 'multi_select' || v === 'multi-select') return 'multiselect';
  return 'text';
}

/**
 * Centralized helper to call the continueWithAnswers API endpoint.
 * This is the single source of truth for all continueWithAnswers calls in the frontend.
 *
 * @param runId - The run ID to continue
 * @param answers - Optional answers object (defaults to empty object)
 * @param apiClient - Optional API client instance (uses native fetch if not provided)
 * @returns Promise that resolves when the API call succeeds
 * @throws Error if the API call fails
 */
export async function continueWithAnswers(
  runId: string,
  answers?: Record<string, unknown>,
  apiClient?: RunApiClient,
): Promise<void> {
  if (apiClient) {
    // Use the API client if provided
    await apiClient.applyAnswers(runId, answers || {});
  } else {
    // Fallback to direct fetch
    const url = `${getApiBaseUrl()}/runs/${runId}/continueWithAnswers`;
    const body = JSON.stringify({ answers: answers || {} });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    if (!res?.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`continueWithAnswers failed: ${errorText}`);
    }
  }
}

/**
 * Auto-continue helper: when there are no questions (e.g., only chat.respond),
 * immediately submit empty answers to proceed execution without user click.
 */
export async function autoContinue(
  runId: string | undefined,
  apiClient?: RunApiClient,
): Promise<void> {
  try {
    if (!runId) return;
    await continueWithAnswers(runId, {}, apiClient);
  } catch (e) {
    // Soft-fail; user can still click Continue if needed
    console.warn('[autoContinue] Auto-continue error', e);
  }
}
