/**
 * RunSocket.ts
 * 
 * WebSocket wrapper for real-time run updates.
 * Features:
 * - Auto-reconnect with exponential backoff + jitter
 * - Heartbeat pings to keep connection alive
 * - JSON parse + event adaptation
 * - Single onEvent callback for simplicity
 */

import { adaptWsEventToUi, type BackendWsMessage } from '../adapters/backendToViewModel';
import type { UiEvent } from '../datasources/DataSource';

export interface RunSocketConfig {
  wsBaseUrl: string;
  runId: string;
  authToken?: string;
  onEvent: (event: UiEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
}

export class RunSocket {
  private ws: WebSocket | null = null;
  private config: RunSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectBaseDelay: number;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isClosed = false;

  constructor(config: RunSocketConfig) {
    this.config = config;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectBaseDelay = config.reconnectBaseDelay || 1000;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('[RunSocket] Already connected');
      return;
    }

    this.isClosed = false;
    this.createConnection();
  }

  close(): void {
    this.isClosed = true;
    this.cleanup();
    
    if (this.ws) {
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
    }

    this.config.onClose?.();
  }

  send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[RunSocket] Cannot send message: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[RunSocket] Failed to send message:', error);
      this.config.onError?.(error as Error);
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private createConnection(): void {
    try {
      const url = this.buildWsUrl();
      console.log('[RunSocket] Connecting to:', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (event) => this.handleError(event);
      this.ws.onclose = (event) => this.handleClose(event);
    } catch (error) {
      console.error('[RunSocket] Failed to create connection:', error);
      this.config.onError?.(error as Error);
      this.scheduleReconnect();
    }
  }

  private buildWsUrl(): string {
    const { wsBaseUrl, runId, authToken } = this.config;
    const url = new URL(`/ws/runs/${runId}`, wsBaseUrl);
    
    if (authToken) {
      url.searchParams.set('token', authToken);
    }

    return url.toString();
  }

  private handleOpen(): void {
    console.log('[RunSocket] Connected');
    this.reconnectAttempts = 0;
    this.startHeartbeat();

    // Emit connection event
    this.config.onEvent({
      type: 'run_status',
      payload: { status: 'connected' },
      ts: new Date().toISOString(),
      runId: this.config.runId,
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      // Handle ping/pong
      if (event.data === 'ping') {
        this.send('pong');
        return;
      }

      if (event.data === 'pong') {
        return;
      }

      // Parse JSON message
      const message = JSON.parse(event.data) as BackendWsMessage;
      
      // Adapt to UI event format
      const uiEvent = adaptWsEventToUi(message);
      uiEvent.runId = uiEvent.runId || this.config.runId;

      // Emit to callback
      this.config.onEvent(uiEvent);
    } catch (error) {
      console.error('[RunSocket] Failed to handle message:', error, event.data);
      this.config.onError?.(error as Error);
    }
  }

  private handleError(event: Event): void {
    console.error('[RunSocket] Error:', event);
    const error = new Error('WebSocket error');
    this.config.onError?.(error);
  }

  private handleClose(event: CloseEvent): void {
    console.log('[RunSocket] Closed:', event.code, event.reason);
    this.cleanup();

    // Don't reconnect if explicitly closed or server closed cleanly
    if (this.isClosed || event.code === 1000) {
      return;
    }

    // Attempt reconnect
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.isClosed) return;
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RunSocket] Max reconnect attempts reached');
      this.config.onError?.(new Error('Max reconnect attempts reached'));
      this.config.onClose?.();
      return;
    }

    this.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const delay = this.calculateReconnectDelay();
    console.log(`[RunSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  private calculateReconnectDelay(): number {
    // Exponential backoff: baseDelay * 2^attempts
    const exponentialDelay = this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    
    // Cap at 30 seconds
    return Math.min(exponentialDelay + jitter, 30000);
  }

  private startHeartbeat(): void {
    // Clear existing interval
    this.stopHeartbeat();

    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
        } catch (error) {
          console.error('[RunSocket] Failed to send heartbeat:', error);
        }
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

// ============================================================================
// Factory Function (convenience)
// ============================================================================

export function createRunSocket(config: RunSocketConfig): RunSocket {
  const socket = new RunSocket(config);
  socket.connect();
  return socket;
}
