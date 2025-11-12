/**
 * Run API Client
 * Core API operations for run management
 */

import { getAccessTokenProvider } from '@/apis/client';
import type {
  CreateRunParams,
  CreateRunResponse,
  GetRunResponse,
  ListRunsParams,
  ListRunsResponse,
  RunApiConfig,
  UiCredential,
} from './types';

// Re-export adapter types and functions that are needed
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
  type BackendCredential,
} from '@/lib/adapters/backendToViewModel';

/**
 * Run API Client class
 * Handles all HTTP requests to the run controller endpoints
 */
export class RunApiClient {
  private config: Required<RunApiConfig>;

  constructor(config: RunApiConfig = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl || this.getDefaultApiUrl(),
      wsBaseUrl: config.wsBaseUrl || this.getDefaultWsUrl(),
      authToken: config.authToken || 'dev',
      teamId: config.teamId || 1,
    };
  }

  // -------------------------------------------------------------------------
  // Create Run
  // -------------------------------------------------------------------------
  async createRun(params: CreateRunParams): Promise<CreateRunResponse> {
    const url = `${this.config.apiBaseUrl}/agent/plan`;

    const history =
      params.messages
        ?.filter((msg) => typeof msg.content === 'string' && msg.content.trim().length > 0)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) ?? undefined;

    const body = {
      prompt: params.prompt,
      messages: history,
    };

    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return {
      goal: data.goal,
      plan: data.plan,
      missing: data.missing,
      runId: data.runId,
    };
  }

  // -------------------------------------------------------------------------
  // Get Run
  // -------------------------------------------------------------------------
  async getRun(
    runId: string,
    options?: { updateCredential?: boolean }
  ): Promise<GetRunResponse> {
    let data: BackendRun;

    // Use POST /retrieve endpoint if updateCredential is true
    if (options?.updateCredential) {
      const url = `${this.config.apiBaseUrl}/runs/${runId}/retrieve`;
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_credential: true }),
      });
      data = await response.json();
    } else {
      // Use GET endpoint for standard retrieval
      const url = `${this.config.apiBaseUrl}/runs/${runId}`;
      const response = await this.fetch(url);
      data = await response.json();
    }

    // Adapt backend response to UI view model
    const run = adaptRunBackendToUi(data);

    // Extract steps
    const steps = data.steps ? adaptStepsBackendToUi(data.steps) : [];

    // Build messages from run data
    const messages = this.buildMessagesFromRun(data, steps);
    run.messages = messages;

    return { run, steps, events: [] };
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
  // Answers + Confirm (awaiting_input flow)
  // -------------------------------------------------------------------------
  async applyAnswers(runId: string, answers: Record<string, unknown>): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/continueWithAnswers`;

    await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });

    return { ok: true };
  }

  async confirm(runId: string): Promise<{ ok: true }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/confirm`;

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
  // List Runs
  // -------------------------------------------------------------------------
  async listRuns(params?: ListRunsParams): Promise<ListRunsResponse> {
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
    const makeHeaders = async () => {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');

      try {
        const provider = getAccessTokenProvider();
        const tokenOrPromise = provider?.();
        const token = tokenOrPromise instanceof Promise ? await tokenOrPromise : tokenOrPromise;
        if (token) headers.set('Authorization', `Bearer ${token}`);
        else if (this.config.authToken)
          headers.set('Authorization', `Bearer ${this.config.authToken}`);
      } catch {
        if (this.config.authToken) headers.set('Authorization', `Bearer ${this.config.authToken}`);
      }
      return headers;
    };

    const doFetch = async (): Promise<Response> => {
      const headers = await makeHeaders();
      return fetch(url, { ...options, headers });
    };

    let response = await doFetch();

    // If unauthorized due to expired token, attempt a single refresh + retry
    if (response.status === 401 || response.status === 403) {
      try {
        let errText = '';
        try {
          errText = await response.clone().text();
        } catch {}
        const looksExpired = /jwt\s*expired|token\s*expired|invalid_token/i.test(errText);
        if (looksExpired) {
          response = await doFetch();
        }
      } catch {
        // fallthrough to error handling below
      }
    }

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

  private buildMessagesFromRun(run: BackendRun, steps: any[]) {
    // If chat items exist, use them directly
    const runWithChat = run as BackendRun & { chat?: { items?: any[] } };
    if (runWithChat.chat?.items && runWithChat.chat.items.length > 0) {
      const messages: any[] = [];
      if (run.prompt) {
        messages.push({
          role: 'user',
          content: run.prompt,
        });
      }

      // Note: Would need to import adaptChatItemsToUiMessages if needed
      // const chatMessages = adaptChatItemsToUiMessages(runWithChat.chat.items);
      // messages.push(...chatMessages);

      return messages;
    }

    // Fallback: Build messages programmatically
    const messages: any[] = [];
    const seenAssistantTexts = new Set<string>();
    const norm = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');

    // User message
    if (run.prompt) {
      messages.push({
        role: 'user',
        content: run.prompt,
      });
    }

    // Plan message
    if (
      run.status === 'planning' ||
      run.status === 'planned' ||
      run.status === 'awaiting_approval'
    ) {
      messages.push(
        buildPlanMessage({
          intent: 'Process request',
          tools: steps.map((s) => s.tool),
          actions: steps.map((s) => s.action || 'Execute'),
          steps,
          awaitingApproval: run.status === 'awaiting_approval',
          mode: run.status === 'awaiting_approval' ? 'approval' : 'plan',
        }),
      );
    }

    // Run status message
    if (run.status && run.status !== 'queued') {
      messages.push(
        buildRunMessage({
          status: run.status,
          started_at: run.createdAt,
          completed_at: run.completedAt,
        }),
      );
    }

    // Log messages (steps)
    if (steps.length > 0 && run.steps) {
      messages.push(buildLogMessage(run.steps));
    }

    // Output message (if there's a summary)
    if (run.config?.summary) {
      const content = run.config.summary;
      const contentNorm = norm(content);
      messages.push(
        buildOutputMessage({
          title: 'Summary',
          content,
          type: 'text',
        }),
      );
      if (contentNorm) seenAssistantTexts.add(contentNorm);
    }

    // Undo message
    if (run.status === 'completed' || run.status === 'succeeded') {
      const hasEffects = run.effects && run.effects.length > 0;
      messages.push(buildUndoMessage(hasEffects || false));
    }

    return messages;
  }

  // Expose config for external access (needed by some utilities)
  getConfig() {
    return this.config;
  }

  // Expose fetch method for external use (needed by question helpers)
  async fetchExternal(url: string, options: RequestInit = {}): Promise<Response> {
    return this.fetch(url, options);
  }
}

// -------------------------------------------------------------------------
// Factory and Singleton
// -------------------------------------------------------------------------

let defaultClient: RunApiClient | null = null;

export function getRunApiClient(config?: RunApiConfig): RunApiClient {
  if (!defaultClient) {
    defaultClient = new RunApiClient(config);
  }
  return defaultClient;
}

export function createRunApiClient(config?: RunApiConfig): RunApiClient {
  return new RunApiClient(config);
}
