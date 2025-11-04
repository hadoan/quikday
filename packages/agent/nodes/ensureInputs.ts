import type { Node } from '../runtime/graph.js';
import type { RunState, Question, QuestionType } from '../state/types.js';
import type { RunEventBus } from '@quikday/libs';
import { events } from '../observability/events.js';

/**
 * Ensure all required goal inputs are answered.
 * - If unresolved required inputs remain, set awaiting questions and pause the run.
 * - Otherwise, noop and allow graph to continue.
 */
export const ensureInputs: Node<RunState, RunEventBus> = async (s, eventBus) => {
  try {
    const goal = (s.scratch as any)?.goal;
    const missing = Array.isArray(goal?.missing) ? goal.missing : [];

    if (missing.length === 0) {
      // No required inputs to check
      return { scratch: { ...s.scratch, awaiting: null } };
    }

    // Already provided answers or goal-extracted provided values
    const providedAnswers: Record<string, unknown> = { ...(s.scratch?.answers ?? {}) };
    const provided: Record<string, unknown> = goal?.provided ?? {};

    const unresolved = missing.filter((m: any) => {
      const v = providedAnswers[m.key] ?? provided[m.key];
      if (v === undefined || v === null) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'string') return v.trim().length === 0;
      return false;
    });

    if (unresolved.length === 0) {
      // All good, clear any awaiting
      return { scratch: { ...s.scratch, awaiting: null } };
    }

    // Map unresolved inputs → UI questions
    const typeMap: Record<string, QuestionType> = {
      string: 'text',
      text: 'textarea',
      textarea: 'textarea',
      email: 'email',
      email_list: 'email_list',
      datetime: 'datetime',
      date: 'date',
      time: 'time',
      number: 'number',
      select: 'select',
      multiselect: 'multiselect',
      duration: 'number',
      boolean: 'boolean',
    };

    const questions: Question[] = unresolved.map((m: any) => {
      const qt: QuestionType = m.type ? (typeMap[m.type] || 'text') : 'text';
      const label = m.question || `Please provide ${m.key}`;
      const opts = Array.isArray(m.options)
        ? m.options.filter((o: any) => typeof o === 'string')
        : undefined;
      return {
        key: m.key,
        question: label,
        type: qt,
        required: m.required !== false,
        options: opts,
      };
    });

    const ts = new Date().toISOString();
    const nextScratch: RunState['scratch'] = {
      ...(s.scratch ?? {}),
      awaiting: { reason: 'missing_info', questions, ts },
    };
    const nextOutput: RunState['output'] = {
      ...(s.output ?? {}),
      awaiting: { reason: 'missing_info', questions, ts },
    };

    // Notify subscribers/UI
    events.awaitingInput(s, eventBus, questions);

    return { scratch: nextScratch, output: nextOutput };
  } catch {
    // Non-fatal
    return { scratch: { ...s.scratch } };
  }
};
