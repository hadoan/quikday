import type { Node } from '../runtime/graph.js';
import type { RunState, Question, QuestionType } from '../state/types.js';
import type { RunEventBus } from '@quikday/libs';
import { needsApproval } from '../guards/policy.js';
import { events } from '../observability/events.js';
import { randomUUID } from 'node:crypto';

type GoalMissing = {
  key: string;
  question: string;
  type?: string;
  required?: boolean;
};

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  // Feature toggle: approvals can be disabled via ctx.meta.approvalsEnabled or env
  // Default: disabled (can be re-enabled later)
  const metaFlag = (s.ctx as any)?.meta?.approvalsEnabled;
  const envFlag = (process.env.AGENT_APPROVALS_ENABLED ?? 'false').toString().toLowerCase();
  const approvalsEnabled = typeof metaFlag === 'boolean' ? metaFlag : envFlag === 'true';

  // If goal extraction detected missing required information, pause run and ask the user.
  try {
    const goal = (s.scratch as any)?.goal;
    const missing: GoalMissing[] = Array.isArray(goal?.missing) ? goal.missing : [];

    console.log('[confirm] Goal object:', JSON.stringify(goal, null, 2));
    console.log('[confirm] Missing fields count:', missing.length);

    if (missing.length > 0) {
      // Collect already known answers to avoid re-asking
      const providedAnswers: Record<string, unknown> = { ...(s.scratch?.answers ?? {}) };
      const provided: Record<string, unknown> = goal?.provided ?? {};

      const unresolved = missing.filter((m) => {
        const v = providedAnswers[m.key] ?? provided[m.key];
        if (v === undefined || v === null) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'string') return v.trim().length === 0;
        return false;
      });

      console.log('[confirm] Unresolved missing fields:', unresolved.length);
      console.log('[confirm] Questions to ask:', JSON.stringify(unresolved, null, 2));

      if (unresolved.length > 0) {
        // Map goal missing types → UI questions shape
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

        const questions: Question[] = unresolved.map((m) => {
          const qt: QuestionType = m.type ? (typeMap[m.type] || 'text') : 'text';
          return { 
            key: m.key, 
            question: m.question, 
            type: qt, 
            required: m.required !== false 
          };
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
        events.awaitingInput(s, eventBus, questions);

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
