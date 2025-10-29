/* RunListSocket: lightweight WS for list-level updates */
export class RunListSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseUrl: string;
  private onUpsert: (payload: any) => void;

  constructor(baseUrl: string, onUpsert: (payload: any) => void) {
    this.baseUrl = baseUrl;
    this.onUpsert = onUpsert;
  }

  connect() {
    const wsUrl = new URL('/ws/runs-stream', this.baseUrl);
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg?.type === 'runs.upsert') {
          this.onUpsert(msg.payload);
        }
      } catch {}
    };

    this.ws.onerror = () => {
      this.scheduleReconnect();
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * this.reconnectAttempts, 5000);
    setTimeout(() => this.connect(), delay);
  }
}

export function createRunListSocket(onUpsert: (payload: any) => void) {
  const base = import.meta.env.VITE_WS_BASE_URL || window.location.origin.replace('http', 'ws');
  const sock = new RunListSocket(base, onUpsert);
  sock.connect();
  return sock;
}

