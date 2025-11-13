import * as React from 'react';
import { getDataSource } from '@/lib/flags/featureFlags';
import { continueWithAnswers } from '@/apis/runs';
import {
  TextInput,
  SelectInput,
  MultiselectInput,
  EmailListField,
} from '@/components/input';
import { normalizeType, validateField, normalizeAnswerValue } from '@/lib/utils/questionValidation';

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

export type StepInfo = {
  id: string;
  tool: string;
  appId?: string;
  credentialId?: number | null;
  action?: string;
};

export function QuestionsPanel({
  runId,
  questions,
  onSubmitted,
  steps,
}: {
  runId: string;
  questions: Question[];
  onSubmitted?: () => void;
  steps: StepInfo[];
}) {
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string | null>>({});

  console.log('steps........................');
  console.log(steps);
  // Filter steps that need credentials installed
  const stepsNeedingInstall = React.useMemo(() => {
    if (!Array.isArray(steps)) {
      console.log('[MissingCredentials] No steps array provided:', steps);
      return [];
    }
    console.log('[MissingCredentials] Checking steps for missing credentials:', steps);
    const missing = steps.filter(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined),
    );
    console.log('[MissingCredentials] Steps needing install:', missing);
    return missing;
  }, [steps]);

  const hasMissingCredentials = stepsNeedingInstall.length > 0;

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

  // Don't show questions panel if there are missing credentials
  if (hasMissingCredentials) {
    console.log('[QuestionsPanel] Skipping questions panel due to missing credentials');
    return null;
  }

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
  }, [questions, answers]);

  return (
    <form
      className="space-y-3 border rounded p-3 sm:p-4 max-w-4xl mx-auto bg-card"
      onSubmit={async (e) => {
        e.preventDefault();

        console.log('[QuestionsPanel] Form submit attempted');
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
            payloadAnswers[q.key] = normalizeAnswerValue(q, answers[q.key]);
          }

          // Use centralized continueWithAnswers helper
          const ds = getDataSource();
          await continueWithAnswers(runId, payloadAnswers, ds);

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
          : Array.isArray(questions) && questions.length === 0
            ? 'Ready to continue'
            : 'Provide Missing Information'}
      </h4>
      <p className="text-sm text-muted-foreground">
        {submitted
          ? 'Your information has been submitted. The run will continue automatically.'
          : Array.isArray(questions) && questions.length === 0
            ? 'No additional details are required. Click Continue to proceed.'
            : 'Please provide the requested information to continue the run.'}
      </p>

      {/* Questions grid */}
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
                    <span aria-hidden className="text-destructive">
                      *
                    </span>
                    <span className="sr-only"> required</span>
                  </>
                )}
              </label>
              {q.rationale && <p className="text-xs text-gray-500">{q.rationale}</p>}

              {t === 'textarea' ? (
                <TextInput
                  type="text"
                  value={valueStr}
                  placeholder={q.placeholder}
                  required={required}
                  disabled={submitted}
                  rows={4}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'email' ? (
                <TextInput
                  type="email"
                  value={valueStr}
                  placeholder={q.placeholder}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'email_list' ? (
                <EmailListField
                  value={Array.isArray(value) ? value : []}
                  placeholder={q.placeholder}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'datetime' ? (
                <TextInput
                  type="datetime-local"
                  value={valueStr}
                  placeholder={q.placeholder}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'date' ? (
                <TextInput
                  type="date"
                  value={valueStr}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'time' ? (
                <TextInput
                  type="time"
                  value={valueStr}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'number' ? (
                <TextInput
                  type="number"
                  value={typeof value === 'number' ? value : valueStr}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'select' ? (
                <SelectInput
                  value={valueStr}
                  options={options}
                  placeholder={q.placeholder}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : t === 'multiselect' ? (
                <MultiselectInput
                  value={Array.isArray(value) ? (value as string[]) : []}
                  options={q.options ?? []}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
                />
              ) : (
                // fallback to text
                <TextInput
                  type="text"
                  value={valueStr}
                  placeholder={q.placeholder}
                  required={required}
                  disabled={submitted}
                  onChange={(val) => setFieldValue(q.key, val, q)}
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
            className="px-3 py-1 rounded bg-black text-white hover:bg-black/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
