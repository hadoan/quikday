import type { Question } from '@/components/chat/QuestionsPanel';

/**
 * Email validation regex pattern
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes question type strings to a consistent format
 * Handles variants like 'date_time', 'datetime_local', etc.
 */
export function normalizeType(t?: Question['type'] | string): string {
  const raw = (t ?? 'text').toString().toLowerCase().trim();
  const norm = raw.replace(/[-\s]/g, '_');
  if (norm === 'date_time') return 'datetime';
  if (norm === 'datetime_local') return 'datetime';
  return norm;
}

/**
 * Validates a field value based on the question type and requirements
 * Returns an error message if validation fails, null if valid
 */
export function validateField(q: Question, value: unknown): string | null {
  const required = q.required !== false;
  const t = normalizeType(q.type);

  // Check required fields
  if (required) {
    if (t === 'multiselect' || t === 'email_list') {
      if (!Array.isArray(value) || value.length === 0) return 'Required';
    } else if (t === 'number') {
      if (value === '' || value === null || value === undefined) return 'Required';
    } else {
      if (value === '' || value === null || value === undefined) return 'Required';
    }
  }

  // Allow empty optional fields
  if (value === '' || value === null || value === undefined) return null;

  // Type-specific validation
  switch (t) {
    case 'email':
      return EMAIL_REGEX.test(String(value)) ? null : 'Invalid email';

    case 'email_list': {
      if (!Array.isArray(value)) return 'Invalid value';
      for (const e of value) {
        if (!EMAIL_REGEX.test(String(e))) return `Invalid email: ${e}`;
      }
      return null;
    }

    case 'datetime': {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? 'Invalid date/time' : null;
    }

    case 'date': {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
      return ok ? null : 'Invalid date';
    }

    case 'time': {
      const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
      return ok ? null : 'Invalid time';
    }

    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? null : 'Invalid number';
    }

    case 'select': {
      if (q.options && q.options.length > 0) {
        return q.options.includes(String(value)) ? null : 'Invalid option';
      }
      return null;
    }

    case 'multiselect': {
      if (!Array.isArray(value)) return 'Invalid value';
      if (q.options && q.options.length > 0) {
        for (const v of value) {
          if (!q.options.includes(String(v))) return 'Invalid option';
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Normalizes answer values according to their type for API submission
 * Handles special cases like datetime conversion to ISO format
 */
export function normalizeAnswerValue(
  q: Question,
  raw: unknown,
): string | number | unknown[] | undefined {
  const t = normalizeType(q.type);

  if (raw === '' || raw === undefined) {
    return raw as string | undefined;
  }

  switch (t) {
    case 'datetime': {
      // Convert local datetime-local value to ISO
      // e.g. '2025-10-24T16:00' -> new Date(...) -> ISO
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? raw : d.toISOString();
    }

    case 'number':
      return Number(raw);

    default:
      return raw;
  }
}
