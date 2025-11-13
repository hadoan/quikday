/**
 * Run API Client
 * Core API operations for run management
 */

import { getAccessTokenProvider } from '@/apis/client';
import { createLogger } from '@/lib/utils/logger';
import type {
  CreateRunParams,
  CreateRunResponse,
  GetRunResponse,
  ListRunsParams,
  ListRunsResponse,
  RunApiConfig,
  UiMessage,
  UiCredential,
  UiEvent,
  UiPlanStep,
  UiQuestionItem,
  UiQuestionsData,
} from './types';
import { createRunSocket, type RunSocket } from './websocket';

// Re-export adapter types and functions that are needed
import {
  adaptRunBackendToUi,
  adaptStepsBackendToUi,
  adaptCredentialsBackendToUi,
  adaptChatItemsToUiMessages,
  adaptChatItemToUiMessage,
  buildPlanMessage,
  buildRunMessage,
  buildLogMessage,
  buildOutputMessage,
  buildUndoMessage,
  type BackendRun,
  type BackendCredential,
  type BackendChatItem,
} from '@/lib/adapters/backendToViewModel';

/**
 * Run API Client class
 * Handles all HTTP requests to the run controller endpoints
 */
export class RunApiClient {
  private config: Required<RunApiConfig>;
  private activeSockets = new Map<string, RunSocket>();
  private activePollers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; lastStatus?: string; lastStepCount: number }
  >();
  private logger = createLogger('RunApiClient');
  private currentRunId: string | null = null;

  constructor(config: RunApiConfig = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl || this.getDefaultApiUrl(),
      wsBaseUrl: config.wsBaseUrl || this.getDefaultWsUrl(),
      authToken: config.authToken || 'dev',
      teamId: config.teamId || 1,
    };

    this.logger.info('Initialized', {
      apiBaseUrl: this.config.apiBaseUrl,
      wsBaseUrl: this.config.wsBaseUrl,
    });
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

    // Check for run-level missing inputs
    const runData = data as Record<string, unknown>;
    const runLevelMissing = (runData.missing || runData.missingInputs) as UiQuestionItem[] | undefined;
    console.log('[RunApiClient] Run-level missing/missingInputs:', {
      runId: data.id,
      missing: runLevelMissing,
      steps
    });

    // Build messages from run data
    const messages = this.buildMessagesFromRun(data, steps, runLevelMissing);
    run.messages = messages;
    console.log('[RunApiClient] Built messages for run:', { runId: data.id, messages });
    return { run, steps, events: [] };
  }

  // -------------------------------------------------------------------------
  // Chat Items
  // -------------------------------------------------------------------------
  async getChatItem(
    runId: string,
    chatItemId: string,
  ): Promise<{ item: BackendChatItem; message: UiMessage }> {
    const url = `${this.config.apiBaseUrl}/runs/${runId}/chatItems/${chatItemId}`;
    const response = await this.fetch(url);
    const item = (await response.json()) as BackendChatItem;
    return { item, message: adaptChatItemToUiMessage(item) };
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
  // WebSocket Connection & Cleanup
  // -------------------------------------------------------------------------

  /**
   * Connect to real-time run stream via WebSocket
   * Includes automatic polling fallback and connection management
   */
  connectRunStream(runId: string, onEvent: (evt: UiEvent) => void): { close: () => void } {
    // If the runId looks like a temporary client-generated ID (e.g., `R-<digits>`),
    // avoid opening WS/polling until the real backend ID is known to prevent 404 spam.
    if (/^R-\d+$/.test(runId)) {
      this.logger.info('Deferring stream connection for temporary runId', { runId });
      return {
        close: () => {
          // no-op for temporary id
        },
      };
    }

    // If switching to a different run, close all old connections to prevent stale polling
    if (this.currentRunId && this.currentRunId !== runId) {
      this.logger.info('Switching to new run', {
        oldRunId: this.currentRunId,
        newRunId: runId,
      });
      // Clean up ALL stale connections for other runs
      this.cleanupStaleConnections(runId);
    }

    // Update current run ID
    this.currentRunId = runId;

    // Clean up any existing connection for this specific runId before creating new one
    this.cleanupConnection(runId);

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
          } catch { }
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
        this.logger.info('Closing stream', { runId });
        // Close WS
        try {
          socket.close();
        } catch (err) {
          this.logger.error('Error closing socket in close()', err as Error);
        }
        // Clean up this connection
        this.cleanupConnection(runId);
      },
    };
  }

  /**
   * Clean up all stale connections except for the specified runId
   */
  private cleanupStaleConnections(currentRunId: string): void {
    this.logger.info('Cleaning up stale connections', { currentRunId });

    // Close and remove all sockets except current
    const socketsToClose: string[] = [];
    for (const [id, socket] of this.activeSockets.entries()) {
      if (id !== currentRunId) {
        socketsToClose.push(id);
      }
    }

    for (const id of socketsToClose) {
      this.logger.info('Closing stale socket', { runId: id });
      const socket = this.activeSockets.get(id);
      if (socket) {
        try {
          socket.close();
        } catch (err) {
          this.logger.error('Error closing socket', err as Error);
        }
        this.activeSockets.delete(id);
      }
    }

    // Stop and remove all pollers except current
    const pollersToStop: string[] = [];
    for (const [id] of this.activePollers.entries()) {
      if (id !== currentRunId) {
        pollersToStop.push(id);
      }
    }

    for (const id of pollersToStop) {
      this.logger.info('Stopping stale poller', { runId: id });
      const poller = this.activePollers.get(id);
      if (poller) {
        try {
          clearInterval(poller.timer);
        } catch (err) {
          this.logger.error('Error clearing interval', err as Error);
        }
        this.activePollers.delete(id);
      }
    }
  }

  /**
   * Clean up connection for a specific runId
   */
  private cleanupConnection(runId: string): void {
    this.logger.info('Cleaning up connection', { runId });

    // Close socket
    const socket = this.activeSockets.get(runId);
    if (socket) {
      try {
        socket.close();
      } catch (err) {
        this.logger.error('Error closing socket', err as Error);
      }
      this.activeSockets.delete(runId);
    }

    // Stop poller
    const poller = this.activePollers.get(runId);
    if (poller) {
      try {
        clearInterval(poller.timer);
      } catch (err) {
        this.logger.error('Error clearing interval', err as Error);
      }
      this.activePollers.delete(runId);
    }
  }

  /**
   * Poll run for updates (fallback when WebSocket fails)
   */
  private async pollRun(runId: string, onEvent: (evt: UiEvent) => void): Promise<void> {
    // Check if this runId should still be polled
    const poller = this.activePollers.get(runId);
    if (!poller) {
      this.logger.debug('Poller not found, skipping poll', { runId });
      return;
    }

    // If this isn't the current run, stop polling it
    if (this.currentRunId && this.currentRunId !== runId) {
      this.logger.info('Stopping polling for non-current run', {
        runId,
        currentRunId: this.currentRunId,
      });
      clearInterval(poller.timer);
      this.activePollers.delete(runId);
      return;
    }

    try {
      this.logger.debug('Polling run', { runId });
      const { run, steps } = await this.getRun(runId);
      const updatedPoller = this.activePollers.get(runId);
      if (!updatedPoller) return;

      // Emit status change
      if (run.status && updatedPoller.lastStatus !== run.status) {
        onEvent({
          type:
            run.status === 'succeeded' || run.status === 'completed' || run.status === 'done'
              ? 'run_completed'
              : 'run_status',
          payload: { status: run.status, started_at: run.createdAt, completed_at: run.completedAt },
          ts: new Date().toISOString(),
          runId,
        });
        updatedPoller.lastStatus = run.status;
      }

      // Emit new step entries
      const newCount = steps.length;
      const prevCount = updatedPoller.lastStepCount || 0;
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
        updatedPoller.lastStepCount = newCount;
      }

      // Stop polling when terminal
      if (['succeeded', 'failed', 'completed', 'done'].includes(run.status)) {
        this.logger.info('Run reached terminal status, stopping polling', { runId, status: run.status });
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
      } catch { }

      this.logger.error('Polling error', err as Error);
    }
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
        } catch { }
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

  private buildMessagesFromRun(
    run: BackendRun,
    steps: UiPlanStep[],
    runLevelMissing?: UiQuestionItem[],
  ): UiMessage[] {
    // If chat items exist, use them directly (they're the source of truth)
    const runWithChat = run as BackendRun & { chat?: { items?: BackendChatItem[] } };
    if (runWithChat.chat?.items && runWithChat.chat.items.length > 0) {
      this.logger.info('Using saved chat items for messages', {
        runId: run.id,
        itemCount: runWithChat.chat.items.length,
      });

      const messages: UiMessage[] = [];
      if (run.prompt) {
        messages.push({
          role: 'user',
          content: run.prompt,
        });
      }

      // Convert chat items to messages
      this.logger.info('Chat items from backend:', {
        runId: run.id,
        items: runWithChat.chat.items,
      });
      const chatMessages = adaptChatItemsToUiMessages(runWithChat.chat.items);
      this.logger.info('Converted messages:', {
        runId: run.id,
        messages: chatMessages,
      });

      // Patch empty questions in chat items with run-level missing inputs
      const patchedMessages = chatMessages.map((msg) => {

        console.log('[RunApiClient] Checking message for question patching:', { runId: run.id, msg });
        if (msg.type === 'questions' && msg.data) {
          const questionData = msg.data as UiQuestionsData;
          const questions = questionData?.questions;

          // If questions array is empty but we have run-level missing inputs, use those
          if ((!questions || questions.length === 0) && runLevelMissing && runLevelMissing.length > 0) {
            this.logger.info('Patching empty questions with run-level missing inputs', {
              runId: run.id,
              runLevelMissingCount: runLevelMissing.length,
            });
            return {
              ...msg,
              data: {
                ...questionData,
                questions: runLevelMissing,
              },
            };
          }
        }
        return msg;
      });

      messages.push(...patchedMessages);

      return messages;
    }

    // Fallback: Build messages programmatically (for runs without saved chat items)
    this.logger.debug('Building messages programmatically (no saved chat items)', {
      runId: run.id,
    });

    const messages: UiMessage[] = [];
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
          steps: run.steps ?? [],
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
