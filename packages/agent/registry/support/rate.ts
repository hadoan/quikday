/**
 * Tiny per-user+tool leaky-bucket limiter (in-memory).
 * Rate format: "N/m" or "N/s". Replace with Redis in prod.
 */
const buckets = new Map<
  string,
  { tokens: number; last: number; ratePerSec: number; capacity: number }
>();

function parseRate(rate: string) {
  const m = rate.match(/^(\d+)\/(s|m)$/);
  if (!m) return { capacity: 1000, ratePerSec: 1000 }; // effectively unlimited
  const n = parseInt(m[1], 10);
  const per = m[2] === 's' ? 1 : 60;
  return { capacity: n, ratePerSec: n / per };
}

/** Throws { code: "RATE_LIMIT" } when over limit */
export function checkRate(toolName: string, userId: string, rate: string) {
  if (!rate) return;
  const { capacity, ratePerSec } = parseRate(rate);
  const key = `${userId}:${toolName}`;
  const now = Date.now() / 1000;

  const b = buckets.get(key) ?? { tokens: capacity, last: now, ratePerSec, capacity };
  // refill tokens since last check
  const delta = Math.max(0, now - b.last);
  b.tokens = Math.min(b.capacity, b.tokens + delta * b.ratePerSec);
  b.last = now;

  if (b.tokens < 1) {
    const e: any = new Error('RateLimitExceeded');
    e.code = 'RATE_LIMIT';
    throw e;
  }

  b.tokens -= 1;
  buckets.set(key, b);
}
