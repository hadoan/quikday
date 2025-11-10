import type { Question } from '@quikday/types';

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
