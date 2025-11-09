import * as React from 'react';
import { getDataSource } from '@/lib/flags/featureFlags';

export type Question = {
  key: string;
  question: string;
  rationale?: string;
  options?: string[];
  type?:
    | 'text'
    | 'textarea'
    | 'email'
    | 'email_list'
    | 'datetime'
    | 'date'
    | 'time'
    | 'number'
    | 'select'
    | 'multiselect';
  required?: boolean; // default true
  placeholder?: string;
  defaultValue?: string | string[] | number;
};

// NOTE: This component implements the UI contract for rendering a set of
// questions (different control types), local validation, and submission.

function EmailListInput({
  placeholder,
  onAdd,
}: {
  placeholder?: string;
  onAdd: (email: string) => void;
}) {
  const [text, setText] = React.useState('');
  const [localErr, setLocalErr] = React.useState<string | null>(null);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function tryAdd(candidate: string) {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (!emailRegex.test(trimmed)) {
      setLocalErr('Invalid email');
      return;
    }
    onAdd(trimmed);
    setText('');
    setLocalErr(null);
  }

  return (
    <div>
      <input
        className="border rounded px-2 py-1"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            tryAdd(text);
          }
        }}
        onBlur={() => {
          if (text.includes(',')) {
            text.split(',').forEach((t) => tryAdd(t));
          } else {
            tryAdd(text);
          }
        }}
      />
      {localErr && <div className="text-sm text-destructive mt-1">{localErr}</div>}
    </div>
  );
}

export function QuestionsPanel({
  runId,
  questions,
  onSubmitted,
}: {
  runId: string;
  questions: Question[];
  onSubmitted?: () => void;
}) {
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string | null>>({});

  // Source options from backend; no hardcoded defaults
  const getOptionsForQuestion = React.useCallback((q: Question): string[] => {
    return Array.isArray(q.options) ? q.options : [];
  }, []);

  React.useEffect(() => {
    // reset answers when questions change
    const initial: Record<string, unknown> = {};
    const initialFieldErrors: Record<string, string | null> = {};
    questions?.forEach((q) => {
      const t = normalizeType(q.type);
      // For select inputs, intentionally start with no selection even if a
      // defaultValue is provided. This keeps the UI in a "no selection" state
      // until the user explicitly chooses an option.
      if (t === 'select') {
        initial[q.key] = '';
      } else if (q.defaultValue !== undefined) {
        initial[q.key] = q.defaultValue;
      } else if (t === 'multiselect' || t === 'email_list') {
        initial[q.key] = [];
      } else {
        initial[q.key] = '';
      }
      initialFieldErrors[q.key] = null;
    });
    setAnswers(initial);
    setFieldErrors(initialFieldErrors);
  }, [questions]);

  const normalizeType = (t?: Question['type'] | string): string => {
    const raw = (t ?? 'text').toString().toLowerCase().trim();
    const norm = raw.replace(/[-\s]/g, '_');
    if (norm === 'date_time') return 'datetime';
    if (norm === 'datetime_local') return 'datetime';
    return norm;
  };

  const validateField = React.useCallback((q: Question, value: unknown): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const required = q.required !== false;
    const t = normalizeType(q.type);
    if (required) {
      if (t === 'multiselect' || t === 'email_list') {
        if (!Array.isArray(value) || value.length === 0) return 'Required';
      } else if (t === 'number') {
        if (value === '' || value === null || value === undefined) return 'Required';
      } else {
        if (value === '' || value === null || value === undefined) return 'Required';
      }
    }

    if (value === '' || value === null || value === undefined) return null;

    switch (t) {
      case 'email':
        return emailRegex.test(String(value)) ? null : 'Invalid email';
      case 'email_list': {
        if (!Array.isArray(value)) return 'Invalid value';
        for (const e of value) {
          if (!emailRegex.test(String(e))) return `Invalid email: ${e}`;
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
        if (q.options && q.options.length > 0)
          return q.options.includes(String(value)) ? null : 'Invalid option';
        return null;
      }
      case 'multiselect': {
        if (!Array.isArray(value)) return 'Invalid value';
        if (q.options && q.options.length > 0) {
          for (const v of value) if (!q.options.includes(String(v))) return 'Invalid option';
        }
        return null;
      }
      default:
        return null;
    }
  }, []);

  function setFieldValue(key: string, value: unknown, q?: Question) {
    setAnswers((a) => ({ ...a, [key]: value }));
    if (q) {
      setFieldErrors((fe) => ({ ...fe, [key]: validateField(q, value) }));
    }
  }

  const allValid = React.useMemo(() => {
    if (!questions) return true;
    for (const q of questions) {
      const err = validateField(q, answers[q.key]);
      if (err) return false;
    }
    return true;
  }, [questions, answers, validateField]);

  return (
    <form
      className="space-y-3 border rounded p-3 sm:p-4 max-w-4xl mx-auto bg-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        // Validate all fields up front and block submit when invalid
        const newFieldErrors: Record<string, string | null> = {};
        let hasErrors = false;
        questions.forEach((q) => {
          const err = validateField(q, answers[q.key]);
          newFieldErrors[q.key] = err;
          if (err) hasErrors = true;
        });
        setFieldErrors(newFieldErrors);

        if (hasErrors) {
          setLoading(false);
          return; // prevent submit when required fields are missing/invalid
        }

        try {
          // normalize answers according to type
          const payloadAnswers: Record<string, unknown> = {};
          for (const q of questions) {
            const t = normalizeType(q.type);
            const raw = answers[q.key];
            if (raw === '' || raw === undefined) {
              payloadAnswers[q.key] = raw;
              continue;
            }
            switch (t) {
              case 'datetime': {
                // convert local datetime-local value to ISO
                // e.g. '2025-10-24T16:00' -> new Date(...) -> ISO
                const d = new Date(String(raw));
                payloadAnswers[q.key] = isNaN(d.getTime()) ? raw : d.toISOString();
                break;
              }
              case 'number':
                payloadAnswers[q.key] = Number(raw);
                break;
              default:
                payloadAnswers[q.key] = raw;
            }
          }

          // Prefer using the project's ApiDataSource so auth headers (OIDC/Kinde)
          // are attached automatically. `getDataSource()` will return either
          // a MockDataSource or ApiDataSource depending on flags.
          const ds = getDataSource() as unknown;
          const dsAny = ds as {
            fetch?: (url: string, opts?: RequestInit) => Promise<Response>;
            config?: { apiBaseUrl?: string };
          };

          const hasQuestions = Array.isArray(questions) && questions.length > 0;
          if (dsAny.fetch && typeof dsAny.fetch === 'function') {
            const apiBase =
              dsAny.config?.apiBaseUrl ??
              (typeof window !== 'undefined'
                ? `${window.location.protocol}//${window.location.hostname}:3000`
                : 'http://localhost:3000');

            // Always use continueWithAnswers; send empty answers when none are required
            const url = `${apiBase}/runs/${runId}/continueWithAnswers`;
            const body = JSON.stringify({ answers: payloadAnswers || {} });

            const res = await dsAny.fetch(url, {
              method: 'POST',
              body,
            });

            if (!res.ok) {
              // try to parse body for structured errors
              const bodyText = await res.text();
              try {
                const parsed = JSON.parse(bodyText);
                if (parsed?.validationErrors) {
                  setFieldErrors((fe) => ({ ...fe, ...parsed.validationErrors }));
                }
                throw new Error(parsed?.message || bodyText || `HTTP ${res.status}`);
              } catch (e) {
                throw new Error(bodyText || `HTTP ${res.status}`);
              }
            }
          } else {
            // Fallback to native fetch — always use continueWithAnswers
            const url = `/runs/${runId}/continueWithAnswers`;
            const init: RequestInit = {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ answers: payloadAnswers || {} }),
            };
            const res = await fetch(url, init);
            if (!res.ok) {
              const txt = await res.text();
              try {
                const parsed = JSON.parse(txt);
                if (parsed?.validationErrors)
                  setFieldErrors((fe) => ({ ...fe, ...parsed.validationErrors }));
                throw new Error(parsed?.message || txt || `HTTP ${res.status}`);
              } catch (e) {
                throw new Error(txt || `HTTP ${res.status}`);
              }
            }
          }

          // success
          setFieldErrors({});
          setSubmitted(true);
          onSubmitted?.();
        } catch (err: unknown) {
          let message: string;
          if (err instanceof Error) message = err.message;
          else message = String(err);
          setError(message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <h4 className="font-medium">
        {submitted
          ? 'Details Submitted'
          : (Array.isArray(questions) && questions.length === 0)
            ? 'Ready to continue'
            : 'Missing details'}
      </h4>
      <p className="text-sm text-muted-foreground">
        {submitted
          ? 'Your information has been submitted. The run will continue automatically.'
          : (Array.isArray(questions) && questions.length === 0)
            ? 'No additional details are required. Click Continue to proceed.'
            : 'Please provide the requested information to continue the run.'}
      </p>

      <div className="grid gap-3 mt-2">
        {questions.map((q) => {
          const t = normalizeType(q.type);
          const value = answers[q.key];
          const err = fieldErrors[q.key];
          const required = q.required !== false;
          const valueStr = value == null ? '' : String(value);
          const options = getOptionsForQuestion(q);
          return (
            <div key={q.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                {q.question}{' '}
                {required && (
                  <>
                    <span aria-hidden className="text-destructive">*</span>
                    <span className="sr-only"> required</span>
                  </>
                )}
              </label>
              {q.rationale && <p className="text-xs text-gray-500">{q.rationale}</p>}

              {t === 'textarea' ? (
                <textarea
                  rows={4}
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  placeholder={q.placeholder}
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'email' ? (
                <input
                  type="email"
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  placeholder={q.placeholder}
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'email_list' ? (
                <div>
                  <div className="flex flex-wrap gap-2 mb-1">
                    {(Array.isArray(value) ? value : []).map((e: string, idx: number) => (
                      <span
                        key={`${q.key}-chip-${idx}`}
                        className="px-2 py-0.5 bg-gray-200 rounded flex items-center gap-2"
                      >
                        <span className="text-sm">{e}</span>
                        {!submitted && (
                          <button
                            type="button"
                            aria-label={`Remove ${e}`}
                            onClick={() =>
                              setFieldValue(
                                q.key,
                                (Array.isArray(value)
                                  ? value.filter((x: string) => x !== e)
                                  : []
                                ).slice(),
                                q,
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {!submitted && (
                    <EmailListInput
                      placeholder={q.placeholder}
                      onAdd={(email) =>
                        setFieldValue(q.key, [...(Array.isArray(value) ? value : []), email], q)
                      }
                    />
                  )}
                </div>
              ) : t === 'datetime' ? (
                <input
                  type="datetime-local"
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  placeholder={q.placeholder}
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'date' ? (
                <input
                  type="date"
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'time' ? (
                <input
                  type="time"
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'number' ? (
                <input
                  type="number"
                  step={1}
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  value={typeof value === 'number' ? value : valueStr}
                  onChange={(ev) =>
                    setFieldValue(q.key, ev.target.value === '' ? '' : Number(ev.target.value), q)
                  }
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              ) : t === 'select' ? (
                options.length > 0 ? (
                  <select
                    className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                    value={valueStr}
                    onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                    disabled={submitted}
                    aria-required={required}
                  >
                    <option value="" disabled>
                      {required ? 'Select… (required)' : 'Select…'}
                    </option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                    placeholder={q.placeholder}
                    value={valueStr}
                    onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                    disabled={submitted}
                    readOnly={submitted}
                    aria-required={required}
                  />
                )
              ) : t === 'multiselect' ? (
                <div className="flex flex-col gap-1">
                  {(q.options ?? []).map((opt) => (
                    <label key={opt} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Array.isArray(value) ? (value as string[]).includes(opt) : false}
                        onChange={(ev) => {
                          const current = Array.isArray(value) ? [...value] : [];
                          if (ev.target.checked) current.push(opt);
                          else {
                            const idx = current.indexOf(opt);
                            if (idx >= 0) current.splice(idx, 1);
                          }
                          setFieldValue(q.key, current, q);
                        }}
                        disabled={submitted}
                        aria-required={required}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                // fallback to text
                <input
                  type="text"
                  className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
                  placeholder={q.placeholder}
                  value={valueStr}
                  onChange={(ev) => setFieldValue(q.key, ev.target.value, q)}
                  disabled={submitted}
                  readOnly={submitted}
                  aria-required={required}
                />
              )}

              {err && <div className="text-sm text-destructive mt-1">{err}</div>}
            </div>
          );
        })}
      </div>

      {error && <div className="text-sm text-destructive mt-2">{error}</div>}

      {!submitted && (
        <div className="mt-4">
          <button
            type="submit"
            className="px-3 py-1 rounded bg-black text-white hover:bg-black/90 transition-colors disabled:opacity-50"
            disabled={loading || !allValid}
          >
            {loading ? 'Submitting…' : 'Continue'}
          </button>
        </div>
      )}

      {submitted && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Submitted successfully</span>
        </div>
      )}
    </form>
  );
}

export default QuestionsPanel;
