import { type Question } from '@/components/chat/QuestionsPanel';

/**
 * Normalize question type from backend string to QuestionsPanel Question type
 */
export function normalizeQuestionType(t?: string): Question['type'] {
  const v = String(t || 'text').toLowerCase();
  if (v === 'textarea') return 'textarea';
  if (v === 'email') return 'email';
  if (v === 'email_list' || v === 'email-list') return 'email_list';
  if (v === 'datetime' || v === 'date_time' || v === 'date-time') return 'datetime';
  if (v === 'date') return 'date';
  if (v === 'time') return 'time';
  if (v === 'number' || v === 'numeric') return 'number';
  if (v === 'select') return 'select';
  if (v === 'multiselect' || v === 'multi_select' || v === 'multi-select') return 'multiselect';
  return 'text';
}

/**
 * Auto-continue helper: when there are no questions (e.g., only chat.respond),
 * immediately submit empty answers to proceed execution without user click.
 */
export async function autoContinue(runId: string | undefined, dataSource: any): Promise<void> {
  try {
    if (!runId) return;
    const dsAny: any = dataSource as any;
    const apiBase =
      dsAny?.config?.apiBaseUrl ??
      (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : 'http://localhost:3000');
    const url = `${apiBase}/runs/${runId}/continueWithAnswers`;
    const body = JSON.stringify({ answers: {} });
    const res = await (dsAny?.fetch
      ? dsAny.fetch(url, { method: 'POST', body })
      : fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
    if (!res?.ok) {
      // Soft-fail; user can still click Continue if needed
      try {
        console.warn('[autoContinue] Auto-continue failed:', await res.text());
      } catch {}
    }
  } catch (e) {
    console.warn('[autoContinue] Auto-continue error', e);
  }
}
