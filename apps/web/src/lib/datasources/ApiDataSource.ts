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
  UiQuestionItem,
  CreateRunParams,
  DataSourceConfig,
} from './DataSource';
import {
  adaptRunBackendToUi,
  adaptStepsBackendToUi,
  adaptCredentialsBackendToUi,
  adaptChatItemsToUiMessages,
  buildPlanMessage,
  buildRunMessage,
  buildLogMessage,
  buildOutputMessage,
  buildUndoMessage,
  type BackendRun,
  type BackendStep,
  type BackendCredential,
  type BackendChatItem,
} from '../adapters/backendToViewModel';
import { createRunSocket, type RunSocket } from '../ws/RunSocket';
import { getAccessTokenProvider } from '@/apis/client';
import { createLogger } from '../utils/logger';

export class ApiDataSource implements DataSource {
  private config: Required<DataSourceConfig>;
  private activeSockets = new Map<string, RunSocket>();
  private activePollers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; lastStatus?: string; lastStepCount: number }
  >();
  private logger = createLogger('ApiDataSource');

  constructor(config: DataSourceConfig = {}) {
    // Set defaults
    this.config = {
      apiBaseUrl: config.apiBaseUrl || this.getDefaultApiUrl(),
      wsBaseUrl: config.wsBaseUrl || this.getDefaultWsUrl(),
      authToken: config.authToken || 'dev', // TODO: Get from auth context
      teamId: config.teamId || 1, // TODO: Get from auth context
    };

    this.logger.info('Initialized', {
      apiBaseUrl: this.config.apiBaseUrl,
      wsBaseUrl: this.config.wsBaseUrl,
    });
  }

  // -------------------------------------------------------------------------
  // Create Run
  // -------------------------------------------------------------------------
  async createRun(
    params: CreateRunParams,
  ): Promise<{ goal: unknown; plan: unknown[]; missing: UiQuestionItem[]; runId?: string }> {
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

    this.logger.info('🌐 Making API request to /agent/plan', {
      timestamp: new Date().toISOString(),
      url,
      hasMessages: !!history,
    });

    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    this.logger.info('✅ Plan API response received', {
      timestamp: new Date().toISOString(),
      runId: data.runId,
      hasGoal: !!data.goal,
      planSteps: data.plan,
      missingFields: data.missing?.length || 0,
      status: response.status,
    });

    return { goal: data.goal, plan: data.plan, missing: data.missing, runId: data.runId };
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
    // If the runId looks like a temporary client-generated ID (e.g., `R-<timestamp>`),
    // avoid opening WS/polling until the real backend ID is known to prevent 404 spam.
    // If the runId looks like a temporary client-generated ID (e.g., `R-<digits>`),
    // avoid opening WS/polling until the real backend ID is known to prevent 404 spam.
    // Accept any number of digits so short dev/test ids like `R-1001` are also
    // treated as temporary.
    if (/^R-\d+$/.test(runId)) {
      this.logger.info('Deferring stream connection for temporary runId', { runId });
      return {
        close: () => {
          // no-op for temporary id
        },
      };
    }

    // Close existing socket for this run if any
    const existingSocket = this.activeSockets.get(runId);
    if (existingSocket) {
      existingSocket.close();
    }

    // Resolve auth token for WS
    // Note: Backend WS currently accepts only no token or 'dev'; do not send OIDC tokens.
    const wsToken = this.config.authToken === 'dev' ? 'dev' : undefined;

    // Create new socket
    const socket = createRunSocket({
      wsBaseUrl: this.config.wsBaseUrl,
      runId,
      authToken: wsToken,
      onEvent,
      onError: (error) => {
        this.logger.error('WebSocket error', error);
        onEvent({
          type: 'error',
          payload: { message: error.message },
          ts: new Date().toISOString(),
          runId,
        });
        // Start polling fallback if not already started
        if (!this.activePollers.has(runId)) {
          this.logger.info('Starting polling fallback for run', { runId });
          const timer = setInterval(() => this.pollRun(runId, onEvent), 2000);
          this.activePollers.set(runId, { timer, lastStatus: undefined, lastStepCount: 0 });
          // Stop noisy WS reconnects once fallback is active
          try {
            socket.close();
          } catch {}
        }
      },
      onClose: () => {
        this.logger.info('WebSocket closed for run', { runId });
        this.activeSockets.delete(runId);
      },
    });

    this.activeSockets.set(runId, socket);

    return {
      close: () => {
        // Close WS
        socket.close();
        this.activeSockets.delete(runId);
        // Stop poller if running
        const poller = this.activePollers.get(runId);
        if (poller) {
          clearInterval(poller.timer);
          this.activePollers.delete(runId);
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Approvals & Control
  // -------------------------------------------------------------------------
  async approve(runId: string, approvedSteps: string[]): Promise<{ ok: true }> {
    console.log('[ApiDataSource] approve called:', { runId, approvedSteps });
    const url = `${this.config.apiBaseUrl}/runs/${runId}/approve`;

    await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify({ approvedSteps }),
    });

    console.log('[ApiDataSource] approve response received');
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
    // Submit answers when there are missing inputs to continue the run
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
  // Optional: List Runs
  // -------------------------------------------------------------------------
  async listRuns(params?: { status?: string[]; limit?: number; cursor?: string }): Promise<{
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
    const makeHeaders = async () => {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      // Try to attach current OIDC access token if available; fall back to static token if set
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
        // Read and check error message (best-effort; may not be JSON)
        let errText = '';
        try {
          errText = await response.clone().text();
        } catch {}
        const looksExpired = /jwt\s*expired|token\s*expired|invalid_token/i.test(errText);
        if (looksExpired) {
          // Retry once with a fresh token
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

  private async pollRun(runId: string, onEvent: (evt: UiEvent) => void): Promise<void> {
    try {
      const { run, steps } = await this.getRun(runId);
      const poller = this.activePollers.get(runId);
      if (!poller) return;

      // Emit status change
      if (run.status && poller.lastStatus !== run.status) {
        onEvent({
          type:
            run.status === 'succeeded' || run.status === 'completed' || run.status === 'done'
              ? 'run_completed'
              : 'run_status',
          payload: { status: run.status, started_at: run.createdAt, completed_at: run.completedAt },
          ts: new Date().toISOString(),
          runId,
        });
        poller.lastStatus = run.status;
      }

      // Emit new step entries
      const newCount = steps.length;
      const prevCount = poller.lastStepCount || 0;
      if (newCount > prevCount) {
        for (let i = prevCount; i < newCount; i++) {
          const s = steps[i];
          onEvent({
            type: s.status === 'failed' ? 'step_failed' : 'step_succeeded',
            payload: {
              tool: s.tool,
              action: s.action,
              status: s.status,
              request: s.request,
              response: s.response,
              errorCode: s.errorCode,
              errorMessage: s.errorMessage,
              startedAt: s.startedAt,
              completedAt: s.completedAt,
            },
            ts: new Date().toISOString(),
            runId,
          });
        }
        poller.lastStepCount = newCount;
      }

      // Stop polling when terminal
      if (['succeeded', 'failed', 'completed', 'done'].includes(run.status)) {
        const p = this.activePollers.get(runId);
        if (p) {
          clearInterval(p.timer);
          this.activePollers.delete(runId);
        }
      }
    } catch (err) {
      // Treat 404 / Run not found as an expected transient condition for
      // client-side temporary runs (they may be created locally before the
      // backend has a persisted run). Avoid noisy error logs in that case.
      try {
        const e = err as Error;
        const msg = e.message || '';
        if (/run not found|404/i.test(msg)) {
          this.logger.debug('Run not found while polling (will retry)', { runId, message: msg });
          return;
        }
      } catch {}

      this.logger.error('Polling error', err as Error);
    }
  }

  private buildMessagesFromRun(run: BackendRun, steps: UiPlanStep[]) {
    // If chat items exist, use them directly (they're the source of truth)
    const runWithChat = run as BackendRun & { chat?: { items?: BackendChatItem[] } };
    if (runWithChat.chat?.items && runWithChat.chat.items.length > 0) {
      this.logger.info('Using saved chat items for messages', {
        runId: run.id,
        itemCount: runWithChat.chat.items.length,
      });

      // Add user prompt first
      const messages: UiRunSummary['messages'] = [];
      if (run.prompt) {
        messages.push({
          role: 'user',
          content: run.prompt,
        });
      }

      // Convert chat items to messages
      const chatMessages = adaptChatItemsToUiMessages(runWithChat.chat.items);
      messages.push(...chatMessages);

      return messages;
    }

    // Fallback: Build messages programmatically (for runs without saved chat items)
    this.logger.debug('Building messages programmatically (no saved chat items)', {
      runId: run.id,
    });

    const messages: UiRunSummary['messages'] = [];
    // Track assistant text we've already included to avoid duplicates
    const seenAssistantTexts = new Set<string>();
    const norm = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');

    // User message
    if (run.prompt) {
      messages.push({
        role: 'user',
        content: run.prompt,
      });
    }

    // Plan message (if planning or planned)
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

    // Output message (if there's a summary or effects)
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

    // Plain assistant text (no tool calls) fallback if backend includes it
    try {
      const anyRun = run as unknown as Record<string, unknown>;
      const output = (anyRun as any).output || (anyRun as any).final_output || {};
      const textOut =
        (typeof output === 'object' && (output.message || output.text || output.content)) ||
        (anyRun.finalMessage as string) ||
        (anyRun.message as string);
      if (typeof textOut === 'string' && textOut.trim().length > 0) {
        const textNorm = norm(textOut);
        if (!seenAssistantTexts.has(textNorm)) {
          messages.push({ role: 'assistant', content: textOut });
          seenAssistantTexts.add(textNorm);
        }
      }
    } catch {
      // ignore
    }

    // Undo message (if completed and has effects)
    if (run.status === 'completed' || run.status === 'succeeded') {
      const hasEffects = run.effects && run.effects.length > 0;
      messages.push(buildUndoMessage(hasEffects || false));
    }

    return messages;
  }
}
