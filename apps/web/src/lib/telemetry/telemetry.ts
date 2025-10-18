/**
 * telemetry.ts
 * 
 * Simple telemetry wrapper for tracking user events.
 * Preserves existing event names and properties.
 */

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, unknown>;
}

// Simple console-based telemetry for now
// Can be replaced with PostHog client when needed
class Telemetry {
  private enabled: boolean;

  constructor() {
    this.enabled = import.meta.env?.DEV || false;
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (!this.enabled) return;

    console.log('[Telemetry]', event, properties);
    
    // TODO: Integrate with PostHog or other analytics
    // if (window.posthog) {
    //   window.posthog.capture(event, properties);
    // }
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.enabled) return;

    console.log('[Telemetry] Identify:', userId, traits);
    
    // TODO: Integrate with PostHog
    // if (window.posthog) {
    //   window.posthog.identify(userId, traits);
    // }
  }
}

export const telemetry = new Telemetry();

// ============================================================================
// Event Helpers (preserve existing event names)
// ============================================================================

export function trackDataSourceActive(value: 'mock' | 'live'): void {
  telemetry.capture('ds_active', { value });
}

export function trackChatSent(params: {
  mode: string;
  hasSchedule: boolean;
  targetsCount?: number;
}): void {
  telemetry.capture('chat_sent', params);
}

export function trackRunQueued(runId: string): void {
  telemetry.capture('run_queued', { runId });
}

export function trackPlanGenerated(runId: string, stepCount: number): void {
  telemetry.capture('plan_generated', { runId, stepCount });
}

export function trackApprovalRequired(runId: string): void {
  telemetry.capture('approval_required', { runId });
}

export function trackApprovalGranted(runId: string, stepCount: number): void {
  telemetry.capture('approval_granted', { runId, stepCount });
}

export function trackStepStarted(params: {
  runId: string;
  tool: string;
  appId?: string;
}): void {
  telemetry.capture('step_started', params);
}

export function trackStepSucceeded(params: {
  runId: string;
  tool: string;
  appId?: string;
}): void {
  telemetry.capture('step_succeeded', params);
}

export function trackStepFailed(params: {
  runId: string;
  tool: string;
  appId?: string;
  errorCode?: string;
}): void {
  telemetry.capture('step_failed', params);
}

export function trackRunCompleted(params: {
  runId: string;
  status: string;
  duration?: number;
}): void {
  telemetry.capture('run_completed', params);
}
