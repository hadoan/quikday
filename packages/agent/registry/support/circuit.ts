export interface CircuitOptions {
  /** Consecutive failures required to open the circuit (default: 5). */
  failureThreshold?: number;
  /** Milliseconds before moving OPEN → HALF (allowing a probe). Default: 60_000. */
  resetMs?: number;
}

export class Circuit {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF' = 'CLOSED';
  private openedAt = 0;

  constructor(private opts: CircuitOptions = {}) {}

  /** Is the circuit currently open (blocking calls)? Moves to HALF when resetMs elapsed. */
  get isOpen() {
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= (this.opts.resetMs ?? 60_000)) {
      // allow a probe
      this.state = 'HALF';
    }
    return this.state === 'OPEN';
  }

  /** Execute a function guarded by the circuit. */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const threshold = this.opts.failureThreshold ?? 5;

    if (this.isOpen) {
      throw Object.assign(new Error('CircuitOpen'), { code: 'CIRCUIT_OPEN' });
    }

    try {
      const res = await fn();
      // success: close circuit & reset failures
      this.failures = 0;
      this.state = 'CLOSED';
      return res;
    } catch (e) {
      this.failures += 1;
      if (this.state === 'HALF' || this.failures >= threshold) {
        this.state = 'OPEN';
        this.openedAt = Date.now();
      }
      throw e;
    }
  }
}
