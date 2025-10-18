/**
 * MockDataSource.ts
 * 
 * Wraps existing mock data to implement the DataSource interface.
 * NO UI CHANGES - returns data in the exact format components already expect.
 * Uses existing mockRuns.ts as the source of truth.
 */

import type {
  DataSource,
  UiRunSummary,
  UiPlanStep,
  UiEvent,
  UiCredential,
  CreateRunParams,
} from './DataSource';
import { mockRuns, mockTools } from '@/data/mockRuns';

export class MockDataSource implements DataSource {
  private eventListeners = new Map<string, ((evt: UiEvent) => void)[]>();
  private mockRunsState = [...mockRuns];

  // -------------------------------------------------------------------------
  // Create Run (simulate backend behavior)
  // -------------------------------------------------------------------------
  async createRun(params: CreateRunParams): Promise<{ runId: string }> {
    const newId = `R-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newRun = {
      id: newId,
      prompt: params.prompt,
      timestamp,
      status: 'running' as const,
      messages: [
        {
          role: 'user' as const,
          content: params.prompt,
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mockRunsState.unshift(newRun as any);

    // Simulate async plan generation
    setTimeout(() => {
      this.emitEvent(newId, {
        type: 'plan_generated',
        payload: {
          intent: 'Process request',
          tools: ['AI'],
          actions: ['Analyze prompt', 'Generate response'],
        },
        ts: new Date().toISOString(),
      });

      if (params.mode === 'auto') {
        setTimeout(() => {
          this.emitEvent(newId, {
            type: 'run_completed',
            payload: {
              status: 'succeeded',
              summary: 'Task completed successfully',
            },
            ts: new Date().toISOString(),
          });
        }, 2000);
      }
    }, 500);

    return { runId: newId };
  }

  // -------------------------------------------------------------------------
  // Get Run (return existing mock structure)
  // -------------------------------------------------------------------------
  async getRun(runId: string): Promise<{
    run: UiRunSummary;
    steps: UiPlanStep[];
    events: UiEvent[];
  }> {
    const mockRun = this.mockRunsState.find((r) => r.id === runId);
    
    if (!mockRun) {
      throw new Error(`Run ${runId} not found`);
    }

    // Extract steps from messages
    const steps: UiPlanStep[] = [];
    const logMessage = mockRun.messages?.find((m) => m.type === 'log');
    
    if (logMessage?.data && Array.isArray(logMessage.data)) {
      logMessage.data.forEach((entry, idx) => {
        if (entry && typeof entry === 'object' && 'tool' in entry) {
          steps.push({
            id: `step-${idx}`,
            tool: entry.tool || 'unknown',
            action: entry.action,
            status: entry.status || 'succeeded',
            time: entry.time,
          });
        }
      });
    }

    // Convert run to UiRunSummary format
    const run: UiRunSummary = {
      id: mockRun.id,
      prompt: mockRun.prompt,
      status: this.normalizeStatus(mockRun.status),
      timestamp: mockRun.timestamp,
      messages: mockRun.messages as UiRunSummary['messages'],
    };

    // Mock events (derived from messages)
    const events: UiEvent[] = [];
    if (mockRun.messages) {
      mockRun.messages.forEach((msg, idx) => {
        if (msg.role === 'assistant' && msg.type) {
          events.push({
            type: this.messageTypeToEventType(msg.type),
            payload: msg.data || {},
            ts: mockRun.timestamp,
            runId,
          });
        }
      });
    }

    return { run, steps, events };
  }

  // -------------------------------------------------------------------------
  // WebSocket Simulation (emit events to listeners)
  // -------------------------------------------------------------------------
  connectRunStream(runId: string, onEvent: (evt: UiEvent) => void): { close: () => void } {
    if (!this.eventListeners.has(runId)) {
      this.eventListeners.set(runId, []);
    }
    
    this.eventListeners.get(runId)!.push(onEvent);

    // Simulate initial connection event
    setTimeout(() => {
      onEvent({
        type: 'run_status',
        payload: { status: 'connected' },
        ts: new Date().toISOString(),
        runId,
      });
    }, 100);

    return {
      close: () => {
        const listeners = this.eventListeners.get(runId);
        if (listeners) {
          const idx = listeners.indexOf(onEvent);
          if (idx > -1) {
            listeners.splice(idx, 1);
          }
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Approvals & Control
  // -------------------------------------------------------------------------
  async approve(runId: string, approvedSteps: string[]): Promise<{ ok: true }> {
    console.log('[MockDataSource] Approved run:', runId, 'steps:', approvedSteps);
    
    // Simulate execution start
    setTimeout(() => {
      this.emitEvent(runId, {
        type: 'step_started',
        payload: { stepId: approvedSteps[0] || 'step-1' },
        ts: new Date().toISOString(),
      });
    }, 500);

    return { ok: true };
  }

  async cancel(runId: string): Promise<{ ok: true }> {
    console.log('[MockDataSource] Cancelled run:', runId);
    
    this.emitEvent(runId, {
      type: 'run_failed',
      payload: { reason: 'cancelled_by_user' },
      ts: new Date().toISOString(),
    });

    return { ok: true };
  }

  async undo(runId: string): Promise<{ ok: true }> {
    console.log('[MockDataSource] Undo run:', runId);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Credentials (return mock credentials)
  // -------------------------------------------------------------------------
  async listCredentials(appId: string, owner: 'user' | 'team'): Promise<UiCredential[]> {
    const tool = mockTools.find((t) => t.name.toLowerCase() === appId.toLowerCase());
    
    if (!tool) {
      return [];
    }

    return [
      {
        id: 1,
        appId,
        label: `${appId} Account`,
        current: true,
        invalid: tool.status !== 'connected',
        lastValidatedAt: new Date().toISOString(),
      },
    ];
  }

  async selectCurrentCredential(credentialId: number): Promise<{ ok: true }> {
    console.log('[MockDataSource] Selected credential:', credentialId);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Optional: List runs
  // -------------------------------------------------------------------------
  async listRuns(params?: {
    status?: string[];
    limit?: number;
    cursor?: string;
  }): Promise<{
    runs: UiRunSummary[];
    nextCursor?: string;
  }> {
    let filtered = [...this.mockRunsState];

    if (params?.status) {
      filtered = filtered.filter((r) => params.status!.includes(r.status));
    }

    const limit = params?.limit || 50;
    const runs: UiRunSummary[] = filtered.slice(0, limit).map((r) => ({
      id: r.id,
      prompt: r.prompt,
      status: this.normalizeStatus(r.status),
      timestamp: r.timestamp,
      messages: r.messages as UiRunSummary['messages'],
    }));

    return {
      runs,
      nextCursor: filtered.length > limit ? `cursor-${limit}` : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------
  private emitEvent(runId: string, event: UiEvent) {
    const listeners = this.eventListeners.get(runId);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  private normalizeStatus(status: string): UiRunSummary['status'] {
    // Map mock statuses to normalized UI statuses
    const statusMap: Record<string, UiRunSummary['status']> = {
      completed: 'completed',
      running: 'running',
      queued: 'queued',
      failed: 'failed',
      planned: 'awaiting_approval',
    };

    return statusMap[status] || (status as UiRunSummary['status']);
  }

  private messageTypeToEventType(msgType: string): UiEvent['type'] {
    const typeMap: Record<string, UiEvent['type']> = {
      plan: 'plan_generated',
      run: 'run_status',
      log: 'step_succeeded',
      output: 'step_output',
      undo: 'run_completed',
    };

    return typeMap[msgType] || 'run_status';
  }
}
