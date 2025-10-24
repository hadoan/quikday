import * as React from 'react';
import { getDataSource } from '@/lib/flags/featureFlags';

export type Question = {
  key: string;
  question: string;
  rationale?: string;
  options?: string[];
};

export function QuestionsPanel({
  runId,
  questions,
  onSubmitted,
}: {
  runId: string;
  questions: Question[];
  onSubmitted?: () => void;
}) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // reset answers when questions change
    const initial: Record<string, string> = {};
    questions?.forEach((q) => (initial[q.key] = ''));
    setAnswers(initial);
  }, [questions]);

  if (!questions || questions.length === 0) return null;

  return (
    <form
      className="space-y-3 border rounded p-3 max-w-4xl mx-auto bg-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          // Prefer using the project's ApiDataSource so auth headers (OIDC/Kinde)
          // are attached automatically. `getDataSource()` will return either
          // a MockDataSource or ApiDataSource depending on flags.
          const ds = getDataSource() as unknown;
          const dsAny = ds as {
            fetch?: (url: string, opts?: RequestInit) => Promise<Response>;
            config?: { apiBaseUrl?: string };
          };

          if (dsAny.fetch && typeof dsAny.fetch === 'function') {
            // ApiDataSource.fetch expects a full URL, so try to read the
            // configured apiBaseUrl. If not present, fall back to a sensible
            // default derived from window.location.
            const apiBase = dsAny.config?.apiBaseUrl
              ?? (typeof window !== 'undefined'
                ? `${window.location.protocol}//${window.location.hostname}:3000`
                : 'http://localhost:3000');

            const res = await dsAny.fetch(`${apiBase}/runs/${runId}/confirm`, {
              method: 'POST',
              body: JSON.stringify({ answers }),
            });

            // ApiDataSource.fetch throws on non-OK, but be defensive:
            if (!res.ok) {
              const txt = await res.text();
              throw new Error(txt || `HTTP ${res.status}`);
            }
          } else {
            // Fallback to native fetch for mock data sources or if dataSource
            // doesn't expose a fetch helper.
            const res = await fetch(`/runs/${runId}/confirm`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ answers }),
            });
            if (!res.ok) {
              const txt = await res.text();
              throw new Error(txt || `HTTP ${res.status}`);
            }
          }

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
      <h4 className="font-medium">Missing details</h4>
      <p className="text-sm text-muted-foreground">Please provide the requested information to continue the run.</p>

      <div className="grid gap-3 mt-2">
        {questions.map((q) => (
          <div key={q.key} className="flex flex-col gap-1">
            <label className="text-sm font-medium">{q.question}</label>
            {q.rationale && <p className="text-xs text-gray-500">{q.rationale}</p>}

            {q.options && q.options.length > 0 ? (
              <select
                className="border rounded px-2 py-1"
                value={answers[q.key] ?? ''}
                onChange={(ev) => setAnswers((a) => ({ ...a, [q.key]: ev.target.value }))}
              >
                <option value="" disabled>
                  Select…
                </option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="border rounded px-2 py-1"
                placeholder={q.key.includes('ISO') ? '2025-10-24T16:00:00Z' : ''}
                value={answers[q.key] ?? ''}
                onChange={(ev) => setAnswers((a) => ({ ...a, [q.key]: ev.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-destructive mt-2">{error}</div>}

      <div className="mt-4">
        <button
          type="submit"
          className="px-3 py-1 rounded bg-black text-white"
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

export default QuestionsPanel;
