import type { Node } from '../runtime/graph.js';
import type { RunState, Question, QuestionType } from '../state/types.js';
import type { RunEventBus } from '@quikday/libs';
import type { IntentInput } from './intents.js';
import { events } from '../observability/events.js';

type IntentMetaLike = {
  inputs?: ReadonlyArray<IntentInput>;
  inputValues?: Record<string, unknown>;
  missingInputs?: string[];
};

function asIntentMeta(v: unknown): IntentMetaLike | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const okInputs = !('inputs' in o) || Array.isArray((o as any).inputs);
  const okVals = !('inputValues' in o) || typeof (o as any).inputValues === 'object';
  const okMissing = !('missingInputs' in o) || Array.isArray((o as any).missingInputs);
  return okInputs && okVals && okMissing ? (o as IntentMetaLike) : null;
}

/**
 * Ensure all required intent inputs are answered.
 * - If unresolved required inputs remain, set awaiting questions and pause the run.
 * - Otherwise, noop and allow graph to continue.
 */
export const ensureInputs: Node<RunState, RunEventBus> = async (s, eventBus) => {
  try {
    const meta = asIntentMeta(s.scratch?.intentMeta);
    const missing: string[] = Array.isArray(meta?.missingInputs) ? meta!.missingInputs! : [];
    const inputs: ReadonlyArray<IntentInput> = Array.isArray(meta?.inputs)
      ? (meta!.inputs as ReadonlyArray<IntentInput>)
      : [];

    if (missing.length === 0 || inputs.length === 0) {
      // No required inputs to check
      return { scratch: { ...s.scratch, awaiting: null } };
    }

    // Already provided answers or LLM-extracted inputValues
    const providedAnswers: Record<string, unknown> = { ...(s.scratch?.answers ?? {}) };
    const inputValues: Record<string, unknown> =
      (meta?.inputValues as Record<string, unknown> | undefined) ?? {};

    const unresolved = missing.filter((k) => {
      const v = (providedAnswers as any)[k] ?? (inputValues as any)[k];
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
    const typeMap: Record<IntentInput['type'], QuestionType> = {
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

    const byKey = new Map(inputs.map((i) => [i.key, i] as const));
    const questions: Question[] = unresolved.map((key) => {
      const def = byKey.get(key);
      const qt: QuestionType = def ? typeMap[def.type] : 'text';
      const label = def?.prompt ?? `Please provide ${key}`;
      return { key, question: label, type: qt, required: def?.required !== false };
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

