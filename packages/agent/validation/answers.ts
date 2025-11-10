// packages/agent/validation/answers.ts

import { z } from 'zod';
import { Question } from '../state/types.js';

const isoDateTime = z.string().datetime(); // ISO 8601
const dateYYYYMMDD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeHHmm = z.string().regex(/^\d{2}:\d{2}$/);
const email = z.string().email();
const splitEmails = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const emailList = z.string().transform(splitEmails).pipe(z.array(z.string().email()).nonempty());

// Optional helper to enforce min/max on numbers
const inRange = (n: number, q: Question) => {
  if (typeof q.min === 'number' && n < q.min) throw new Error(`Must be ≥ ${q.min}`);
  if (typeof q.max === 'number' && n > q.max) throw new Error(`Must be ≤ ${q.max}`);
};

export function validateAnswers(
  questions: Question[],
  answers: Record<string, unknown>,
): { ok: boolean; errors: Record<string, string>; normalized: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};

  for (const q of questions) {
    const required = q.required ?? true;
    const raw = answers[q.key];

    const empty = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (required) errors[q.key] = 'Required';
      continue;
    }

    try {
      let v: unknown = raw;

      // string-ish normalization
      const asString = (x: unknown) => (typeof x === 'string' ? x.trim() : String(x));

      switch (q.type) {
        case 'datetime': {
          const s = asString(v);
          isoDateTime.parse(s);
          // normalize to canonical ISO (Date will reformat if valid)
          const iso = new Date(s).toISOString();
          normalized[q.key] = iso;
          break;
        }

        case 'date': {
          const s = asString(v);
          dateYYYYMMDD.parse(s);
          normalized[q.key] = s;
          break;
        }

        case 'time': {
          const s = asString(v);
          timeHHmm.parse(s);
          normalized[q.key] = s;
          break;
        }

        case 'number': {
          const parsed = z.coerce.number().safeParse(v);
          if (!parsed.success || Number.isNaN(parsed.data)) throw new Error('Invalid number');
          inRange(parsed.data, q);
          normalized[q.key] = parsed.data;
          break;
        }

        case 'select': {
          const s = asString(v);
          if (Array.isArray(q.options) && q.options.length > 0) {
            const canon: Record<string, string> = Object.fromEntries(
              q.options.map((opt) => [String(opt).toLowerCase(), String(opt)]),
            );
            const hit = canon[s.toLowerCase()];
            if (!hit) throw new Error('Invalid option');
            normalized[q.key] = hit;
          } else {
            normalized[q.key] = s;
          }
          break;
        }

        case 'multiselect': {
          const arr = Array.isArray(v) ? v.map(asString) : [asString(v)];
          if (Array.isArray(q.options) && q.options.length > 0) {
            const canon: Record<string, string> = Object.fromEntries(
              q.options.map((opt) => [String(opt).toLowerCase(), String(opt)]),
            );
            const mapped = arr.map((x) => {
              const hit = canon[x.toLowerCase()];
              if (!hit) throw new Error('Invalid option');
              return hit;
            });
            normalized[q.key] = mapped;
          } else {
            normalized[q.key] = arr;
          }
          break;
        }

        case 'email': {
          const s = asString(v);
          email.parse(s);
          normalized[q.key] = s.toLowerCase();
          break;
        }

        case 'email_list': {
          const s = asString(v);
          const list = emailList.parse(s).map((e) => e.toLowerCase());
          normalized[q.key] = list;
          break;
        }

        case 'textarea': {
          // allow long text; optional regex via format
          const s = asString(v);
          if (q.format && q.format.startsWith('/') && q.format.endsWith('/')) {
            const re = new RegExp(q.format.slice(1, -1));
            if (!re.test(s)) throw new Error('Invalid format');
          }
          normalized[q.key] = s;
          break;
        }

        case 'text':
        default: {
          const s = asString(v);
          if (q.format) {
            if (q.format === 'email') {
              email.parse(s);
            } else if (q.format === 'email_list') {
              const list = emailList.parse(s).map((e) => e.toLowerCase());
              normalized[q.key] = list;
              break;
            } else if (q.format.startsWith('/') && q.format.endsWith('/')) {
              const re = new RegExp(q.format.slice(1, -1));
              if (!re.test(s)) throw new Error('Invalid format');
            }
          }
          if (!(q.key in normalized)) normalized[q.key] = s;
          break;
        }
      }
    } catch (e: any) {
      errors[q.key] = e?.message || 'Invalid value';
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, normalized };
}
