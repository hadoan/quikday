import { registry } from '../../registry/registry.js';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function computeHasOutput(result: any): boolean {
  if (result === null || result === undefined) return false;
  if (typeof result === 'string') return result.trim().length > 0;
  if (typeof result === 'number' || typeof result === 'boolean') return true;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === 'object') {
    const entries = Object.entries(result as any);
    let sawArray = false;
    let anyArrayNonEmpty = false;
    let hasOtherMeaningful = false;
    for (const [, v] of entries) {
      if (Array.isArray(v)) {
        sawArray = true;
        if (v.length > 0) anyArrayNonEmpty = true;
      } else if (v !== null && v !== undefined) {
        if (typeof v === 'string') {
          if (v.trim().length > 0) hasOtherMeaningful = true;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          hasOtherMeaningful = true;
        } else if (typeof v === 'object') {
          if (Object.keys(v).length > 0) hasOtherMeaningful = true;
        }
      }
    }
    if (sawArray) return anyArrayNonEmpty;
    if ('count' in (result as any) && Number((result as any).count) === 0) {
      const keys = Object.keys(result as any).filter((k) => k !== 'count');
      const hasOther = keys.some((k) => {
        const v = (result as any)[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (typeof v === 'number' || typeof v === 'boolean') return true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return Boolean(v);
      });
      if (!hasOther) return false;
    }
    return Object.keys(result).length > 0;
  }
  return Boolean(result);
}

export function toSimpleTable(args: Record<string, any>): string {
  try {
    const entries = Object.entries(args ?? {});
    if (entries.length === 0) return 'No inputs';
    const shorten = (v: any) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v.length > 200 ? v.slice(0, 197) + '…' : v;
      try {
        const s = JSON.stringify(v);
        return s.length > 200 ? s.slice(0, 197) + '…' : s;
      } catch {
        return String(v);
      }
    };
    const rows = entries.map(([k, v]) => `| ${k} | ${shorten(v)} |`).join('\n');
    return ['| Field | Value |', '| --- | --- |', rows].join('\n');
  } catch {
    return 'No inputs';
  }
}

export function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

export function previewForLog(v: any): string {
  try {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string')
      return v.length > 120 ? JSON.stringify(v.slice(0, 117) + '…') : JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[Array(${v.length})]`;
    if (typeof v === 'object') return `{Object keys=${Object.keys(v).length}}`;
    return String(v);
  } catch {
    return '[unserializable]';
  }
}

export function isTransient(err: any): boolean {
  const code = (err?.code ?? '').toString().toUpperCase();
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (code === 'RATE_LIMIT' || code === 'CIRCUIT_OPEN') return true;
  if (['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNABORTED'].includes(code))
    return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs: number; maxMs: number },
): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= opts.retries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isTransient(err) || attempt === opts.retries) break;
      const exp = Math.min(opts.maxMs, opts.baseMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * (exp * 0.25));
      const delay = exp + jitter;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

export async function deriveUndoArgs(tool: any, result: any, args: any) {
  if (typeof tool?.undo === 'function') {
    try {
      return await tool.undo({ result, args });
    } catch {
      // pass-through on failure
    }
  }
  return args;
}
