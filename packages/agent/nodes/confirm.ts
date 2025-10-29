import type { Node } from '../runtime/graph';
import type { RunState, Question, QuestionType } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { needsApproval } from '../guards/policy';
import { events } from '../observability/events';
import { randomUUID } from 'node:crypto';
import type { IntentInput } from './intents';

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

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  // Feature toggle: approvals can be disabled via ctx.meta.approvalsEnabled or env
  // Default: disabled (can be re-enabled later)
  const metaFlag = (s.ctx as any)?.meta?.approvalsEnabled;
  const envFlag = (process.env.AGENT_APPROVALS_ENABLED ?? 'false').toString().toLowerCase();
  const approvalsEnabled = typeof metaFlag === 'boolean' ? metaFlag : envFlag === 'true';

  // If classify detected missing inputs, pause run and ask the user.
  try {
    const meta = asIntentMeta(s.scratch?.intentMeta);
    const missing: string[] = Array.isArray(meta?.missingInputs) ? meta!.missingInputs! : [];
    const inputs: ReadonlyArray<IntentInput> = Array.isArray(meta?.inputs)
      ? (meta!.inputs as ReadonlyArray<IntentInput>)
      : [];

    if (missing.length > 0 && inputs.length > 0) {
      // Collect already known answers to avoid re-asking
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

      if (unresolved.length > 0) {
        // Map intent inputs → UI questions shape
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
        };

        const byKey = new Map(inputs.map((i) => [i.key, i] as const));
        const questions: Question[] = unresolved.map((key) => {
          const def = byKey.get(key);
          const qt: QuestionType = def ? typeMap[def.type] : 'text';
          const label = def?.prompt ?? `Please provide ${key}`;
          return { key, question: label, type: qt, required: def?.required !== false };
        });

        const ts = new Date().toISOString();

        // Update scratch.awaiting so graph halts (router checks this)
        const nextScratch: RunState['scratch'] = {
          ...(s.scratch ?? {}),
          awaiting: { reason: 'missing_info', questions, ts },
        };
        s.scratch = nextScratch;

        // Also surface awaiting in output for API/UI consumers
        const nextOutput: RunState['output'] = {
          ...(s.output ?? {}),
          awaiting: { reason: 'missing_info', questions, ts },
        };

        // Notify subscribers
        events.awaitingInput(
          s,
          eventBus,
          questions.map((q) => ({ key: q.key, question: q.question })),
        );

        return { scratch: nextScratch, output: nextOutput };
      }
    }
  } catch {
    // Non-fatal
  }

  s.scratch = { ...s.scratch, awaiting: null };
  const policy = (s.ctx as any).meta?.policy;
  const approvedSteps = new Set<string>(
    Array.isArray((s.ctx as any).meta?.approvedSteps)
      ? ((s.ctx as any).meta.approvedSteps as string[])
      : [],
  );

  const plan = s.scratch?.plan ?? [];
  const pending = plan.filter((step) => !approvedSteps.has(step.id));

  // If approvals disabled, or policy does not require, or everything is already approved → continue
  if (!approvalsEnabled || !needsApproval(s, policy) || pending.length === 0) return;

  const approvalId = randomUUID();
  events.approvalAwaiting(s, eventBus, pending);

  // Signal the worker to pause this run and await approval
  const err: any = new Error('GRAPH_HALT_AWAITING_APPROVAL');
  err.code = 'GRAPH_HALT_AWAITING_APPROVAL';
  err.approvalId = approvalId;
  err.payload = { approvalId, pendingSteps: pending };
  throw err;
};
