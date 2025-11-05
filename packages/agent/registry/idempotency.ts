// Simple in-memory idempotency cache with TTL.
// Replace with Redis/DB-backed store in production.
type Json = any;

class MemoryStore {
  private m = new Map<string, { v: Json; exp: number }>();
  constructor(private ttlMs = 15 * 60 * 1000) {} // 15 minutes

  get<T>(k: string): T | null {
    const r = this.m.get(k);
    if (!r) return null;
    if (Date.now() > r.exp) {
      this.m.delete(k);
      return null;
    }
    return r.v as T;
  }

  set<T>(k: string, v: T) {
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

const store = new MemoryStore();

export const Idempotency = {
  /** Stable key for a (runId, toolName, args) combo */
  key(runId: string, name: string, args: unknown) {
    const raw = JSON.stringify([runId, name, args]);
    // cheap stable hash (32-bit)
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `idem:${name}:${runId}:${Math.abs(hash)}`;
  },

  async find<T>(key: string): Promise<T | null> {
    return store.get<T>(key);
  },

  async store<T>(key: string, value: T): Promise<void> {
    store.set(key, value);
  },
};
