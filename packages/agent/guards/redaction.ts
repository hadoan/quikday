// packages/graph/guards/redaction.ts
import crypto from 'crypto';

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };

// Built-in sensitive key names (lowercased)
const DEFAULT_SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'secret',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'session',
  'ssn',
  'iban',
  'creditcard',
  'card',
  'cvv',
  'pin',
  'private_key',
  'key',
  'email',
  'phone',
  'tel',
]);

// Redaction strategy
export type RedactStrategy =
  | 'mask' // **** (fixed)
  | 'mask-preserve' // keep length/format (e.g., a****@****.com)
  | 'hash' // sha256 hex
  | 'remove'; // delete field

export interface RedactOptions {
  sensitiveKeys?: Iterable<string>; // case-insensitive keys to redact
  sensitivePaths?: string[][]; // array of path arrays, e.g., ["credentials","token"]
  strategy?: RedactStrategy;
  maskChar?: string; // default '*'
  emailMaskKeep?: { left?: number; right?: number }; // for mask-preserve
  phoneMaskKeep?: { end?: number }; // how many last digits to keep
  // Runtime toggles
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactCreditCards?: boolean;
  redactUrlsQuery?: boolean; // strip/mask URL query params
  maxDepth?: number; // stop after depth to avoid cycles
  // Optional stable salt for hashing / tokenization
  salt?: string;
}

const DEFAULTS: Required<Omit<RedactOptions, 'sensitiveKeys' | 'sensitivePaths' | 'salt'>> = {
  strategy: 'mask',
  maskChar: '*',
  emailMaskKeep: { left: 1, right: 2 },
  phoneMaskKeep: { end: 2 },
  redactEmails: true,
  redactPhones: true,
  redactCreditCards: true,
  redactUrlsQuery: true,
  maxDepth: 8,
};

// Simple detectors
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d[\d\s-]{6,}\d)/;
const CC_RE = /\b(?:\d[ -]*?){13,19}\b/; // naive CC (Luhn not enforced)
const URL_RE = /\bhttps?:\/\/[^\s]+/i;

// Public API
export function redact<T extends Json>(value: T, opts?: RedactOptions): T {
  const o = { ...DEFAULTS, ...opts };
  const sensKeys = new Set(
    Array.from(opts?.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS, (k) => k.toLowerCase()),
  );

  const pathMatchers = (opts?.sensitivePaths ?? []).map((p) => p.map((s) => s.toLowerCase()));

  const seen = new WeakSet<object>();

  function isSensitivePath(path: string[]) {
    const lower = path.map((p) => p.toLowerCase());
    return pathMatchers.some(
      (m) => m.length <= lower.length && m.every((seg, i) => seg === lower[i]),
    );
  }

  function hash(v: string) {
    const h = crypto.createHash('sha256');
    h.update(o.salt ?? '');
    h.update(v);
    return h.digest('hex');
  }

  function maskFixed() {
    return '****';
  }

  function maskPreserveEmail(s: string) {
    const [user, domain] = s.split('@');
    if (!domain) return maskFixed();
    const keepL = o.emailMaskKeep.left ?? 1;
    const keepR = o.emailMaskKeep.right ?? 2;
    const u = user.slice(0, keepL) + o.maskChar.repeat(Math.max(0, user.length - keepL));
    const [host, tld = ''] = domain.split('.');
    const hostMasked = o.maskChar.repeat(Math.max(0, host.length - keepR)) + host.slice(-keepR);
    return `${u}@${hostMasked}${tld ? '.' + tld : ''}`;
  }

  function maskPreservePhone(s: string) {
    const digits = s.replace(/\D/g, '');
    const keep = o.phoneMaskKeep.end ?? 2;
    const masked = o.maskChar.repeat(Math.max(0, digits.length - keep)) + digits.slice(-keep);
    // keep spacing similar - operate on an array so we can shift characters
    const maskedArr = masked.split('');
    return s.replace(/\d/g, () => (maskedArr.length ? (maskedArr.shift() as any) : o.maskChar));
  }

  function maskPreserveGeneric(s: string) {
    const keep = Math.min(3, Math.ceil(s.length * 0.15));
    return s.slice(0, keep) + o.maskChar.repeat(Math.max(0, s.length - keep));
  }

  function redactStringLeaf(s: string): string {
    // URL query stripping
    if (o.redactUrlsQuery && URL_RE.test(s)) {
      try {
        const u = new URL(s);
        if (u.search) {
          u.search = ''; // drop all queries
          return u.toString();
        }
      } catch {
        /* ignore */
      }
    }
    let redacted = s;

    if (o.redactEmails && EMAIL_RE.test(redacted)) {
      redacted = redacted.replace(EMAIL_RE, (m) =>
        o.strategy === 'hash'
          ? hash(m)
          : o.strategy === 'mask-preserve'
            ? maskPreserveEmail(m)
            : o.strategy === 'remove'
              ? ''
              : maskFixed(),
      );
    }

    if (o.redactPhones && PHONE_RE.test(redacted)) {
      redacted = redacted.replace(PHONE_RE, (m) =>
        o.strategy === 'hash'
          ? hash(m)
          : o.strategy === 'mask-preserve'
            ? maskPreserveGeneric(m) // phones vary; keep generic
            : o.strategy === 'remove'
              ? ''
              : maskFixed(),
      );
    }

    if (o.redactCreditCards && CC_RE.test(redacted)) {
      redacted = redacted.replace(CC_RE, (m) =>
        o.strategy === 'hash'
          ? hash(m)
          : o.strategy === 'mask-preserve'
            ? maskPreserveGeneric(m)
            : o.strategy === 'remove'
              ? ''
              : maskFixed(),
      );
    }
    return redacted;
  }

  function walk(val: Json, path: string[] = []): Json {
    if (val === null) return val;
    if (typeof val === 'string') return redactStringLeaf(val);
    if (typeof val !== 'object') return val;

    if (seen.has(val as object)) return '[Circular]' as unknown as Json;
    seen.add(val as object);

    if (Array.isArray(val)) return val.map((v, i) => walk(v, path.concat(String(i)))) as Json;

    // object
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(val)) {
      const keyLower = k.toLowerCase();
      const nextPath = path.concat(k);

      const keySensitive = sensKeys.has(keyLower) || isSensitivePath(nextPath);
      if (keySensitive) {
        switch (o.strategy) {
          case 'hash':
            out[k] = typeof v === 'string' ? hash(v) : maskFixed();
            break;
          case 'remove':
            continue; // drop field
          case 'mask-preserve':
            out[k] = typeof v === 'string' ? maskPreserveGeneric(v) : maskFixed();
            break;
          default:
            out[k] = maskFixed();
        }
        continue;
      }

      out[k] = walk(v as Json, nextPath);
    }
    return out as Json;
  }

  return walk(value) as T;
}

// Convenience for logging: returns a deep-cloned, redacted copy
export function redactForLog<T extends Json>(data: T, opts?: RedactOptions): T {
  return redact<T>(data, opts);
}
