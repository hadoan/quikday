/**
 * ApiDataSource.ts
 * 
 * Calls REST endpoints and WebSocket, then uses adapters to return UI-compatible shapes.
 * Returns the SAME view models as MockDataSource so UI components are unchanged.
 */

import type {
  DataSource,
  UiRunSummary,
  UiPlanStep,
  UiEvent,
  UiCredential,
  CreateRunParams,
  DataSourceConfig,
} from './DataSource';
import {
  adaptRunBackendToUi,
  adaptStepsBackendToUi,
  adaptCredentialsBackendToUi,
  buildPlanMessage,
  buildRunMessage,
  buildLogMessage,
  buildOutputMessage,
  buildUndoMessage,
  type BackendRun,
  type BackendStep,
  type BackendCredential,
} from '../adapters/backendToViewModel';
import { createRunSocket, type RunSocket } from '../ws/RunSocket';

export class ApiDataSource implements DataSource {
  private config: Required<DataSourceConfig>;
  private activeSockets = new Map<string, RunSocket>();

  constructor(config: DataSourceConfig = {}) {
    // Set defaults
    this.config = {
      apiBaseUrl: config.apiBaseUrl || this.getDefaultApiUrl(),
      wsBaseUrl: config.wsBaseUrl || this.getDefaultWsUrl(),
      authToken: config.authToken || 'dev', // TODO: Get from auth context
      teamId: config.teamId || 1, // TODO: Get from auth context
    };

    console.log('[ApiDataSource] Initialized:', {
      apiBaseUrl: this.config.apiBaseUrl,
      wsBaseUrl: this.config.wsBaseUrl,
    });
  }

  // -------------------------------------------------------------------------
  // Create Run
  // -------------------------------------------------------------------------
  async createRun(params: CreateRunParams): Promise<{ runId: string }> {
    const url = `${this.config.apiBaseUrl}/runs`;
    
    const body = {
      prompt: params.prompt,
      mode: params.mode,
      teamId: this.config.teamId,
      scheduledAt: params.scheduledAt,
      channelTargets: params.targets,
      toolAllowlist: params.toolAllowlist,
    };

    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return { runId: data.id };
  }

  // -------------------------------------------------------------------------
  // Get Run
  // -------------------------------------------------------------------------
  async getRun(runId: string): Promise<{
    run: UiRunSummary;
    steps: UiPlanStep[];
    events: UiEvent[];
  }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}`;
    const response = await this.fetch(url);
    const data: BackendRun = await response.json();

    // Adapt backend response to UI view model
    const run = adaptRunBackendToUi(data);
    
    // Extract steps
    const steps = data.steps ? adaptStepsBackendToUi(data.steps) : [];

    // Build messages from run data
    const messages = this.buildMessagesFromRun(data, steps);
    run.messages = messages;

    // Mock events (real events would come from WS history)
    const events: UiEvent[] = [];

    return { run, steps, events };
  }

  // -------------------------------------------------------------------------
  // WebSocket Connection
  // -------------------------------------------------------------------------
  connectRunStream(runId: string, onEvent: (evt: UiEvent) => void): { close: () => void } {
    // Close existing socket for this run if any
    const existingSocket = this.activeSockets.get(runId);
    if (existingSocket) {
      existingSocket.close();
    }

    // Create new socket
    const socket = createRunSocket({
      wsBaseUrl: this.config.wsBaseUrl,
      runId,
      authToken: this.config.authToken,
      onEvent,
      onError: (error) => {
        console.error('[ApiDataSource] WebSocket error:', error);
        onEvent({
          type: 'error',
          payload: { message: error.message },
          ts: new Date().toISOString(),
          runId,
        });
      },
      onClose: () => {
        console.log('[ApiDataSource] WebSocket closed for run:', runId);
        this.activeSockets.delete(runId);
      },
    });

    this.activeSockets.set(runId, socket);

    return {
      close: () => {
        socket.close();
        this.activeSockets.delete(runId);
      },
    };
  }

  // -------------------------------------------------------------------------
  // Approvals & Control
  // -------------------------------------------------------------------------
  async approve(runId: string, approvedSteps: string[]): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/approve`;
    
    await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify({ approvedSteps }),
    });

    return { ok: true };
  }

  async cancel(runId: string): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/cancel`;
    
    await this.fetch(url, {
      method: 'POST',
    });

    return { ok: true };
  }

  async undo(runId: string): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/undo`;
    
    await this.fetch(url, {
      method: 'POST',
    });

    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Credentials
  // -------------------------------------------------------------------------
  async listCredentials(appId: string, owner: 'user' | 'team'): Promise<UiCredential[]> {
    const url = `${this.config.apiBaseUrl}/credentials?appId=${appId}&owner=${owner}`;
    
    const response = await this.fetch(url);
    const data: BackendCredential[] = await response.json();

    return adaptCredentialsBackendToUi(data);
  }

  async selectCurrentCredential(credentialId: number): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/credentials/${credentialId}/select`;
    
    await this.fetch(url, {
      method: 'POST',
    });

    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Optional: List Runs
  // -------------------------------------------------------------------------
  async listRuns(params?: {
    status?: string[];
    limit?: number;
    cursor?: string;
  }): Promise<{
    runs: UiRunSummary[];
    nextCursor?: string;
  }> {
    const url = new URL(`${this.config.apiBaseUrl}/runs`);
    
    if (params?.status) {
      params.status.forEach((s) => url.searchParams.append('status', s));
    }
    
    if (params?.limit) {
      url.searchParams.set('limit', params.limit.toString());
    }
    
    if (params?.cursor) {
      url.searchParams.set('cursor', params.cursor);
    }

    const response = await this.fetch(url.toString());
    const data: { runs: BackendRun[]; nextCursor?: string } = await response.json();

    const runs = data.runs.map((r) => adaptRunBackendToUi(r));

    return {
      runs,
      nextCursor: data.nextCursor,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${this.config.authToken}`);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(error);
    }

    return response;
  }

  private async parseError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return data.error?.message || data.message || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status} ${response.statusText}`;
    }
  }

  private getDefaultApiUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:3000';
    }

    const viteApiUrl = import.meta.env?.VITE_API_BASE_URL;
    if (viteApiUrl) {
      return viteApiUrl;
    }

    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  private getDefaultWsUrl(): string {
    if (typeof window === 'undefined') {
      return 'ws://localhost:3000';
    }

    const viteWsUrl = import.meta.env?.VITE_WS_BASE_URL;
    if (viteWsUrl) {
      return viteWsUrl;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:3000`;
  }

  private buildMessagesFromRun(run: BackendRun, steps: UiPlanStep[]) {
    const messages: UiRunSummary['messages'] = [];

    // User message
    if (run.prompt) {
      messages.push({
        role: 'user',
        content: run.prompt,
      });
    }

    // Plan message (if planning or planned)
    if (run.status === 'planning' || run.status === 'planned' || run.status === 'awaiting_approval') {
      messages.push(
        buildPlanMessage({
          intent: 'Process request',
          tools: steps.map((s) => s.tool),
          actions: steps.map((s) => s.action || 'Execute'),
          steps,
        })
      );
    }

    // Run status message
    if (run.status && run.status !== 'queued') {
      messages.push(
        buildRunMessage({
          status: run.status,
          started_at: run.createdAt,
          completed_at: run.completedAt,
        })
      );
    }

    // Log messages (steps)
    if (steps.length > 0 && run.steps) {
      messages.push(buildLogMessage(run.steps));
    }

    // Output message (if there's a summary or effects)
    if (run.config?.summary) {
      messages.push(
        buildOutputMessage({
          title: 'Summary',
          content: run.config.summary,
          type: 'text',
        })
      );
    }

    // Undo message (if completed and has effects)
    if (run.status === 'completed' || run.status === 'succeeded') {
      const hasEffects = run.effects && run.effects.length > 0;
      messages.push(buildUndoMessage(hasEffects || false));
    }

    return messages;
  }
}
