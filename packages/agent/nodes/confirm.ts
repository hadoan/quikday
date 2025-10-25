import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { needsApproval } from '../guards/policy';
import { events } from '../observability/events';
import { randomUUID } from 'node:crypto';

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const questions =
    s.output?.diff?.questions ??
    s.scratch?.missing ??
    [];

  // Check if all questions have answers already
  const answers = s.scratch?.answers ?? {};
  const unanswered = questions.filter(q => !answers[q.key]);

  if (unanswered.length > 0) {
    // Mark the run as waiting and emit an event for the UI
    s.scratch = {
      ...s.scratch,
      awaiting: {
        type: 'input' as const,
        questions: unanswered,
        askedAt: new Date().toISOString(),
      } as any,
    } as any;

    // Tell clients we’re waiting for input (WS)
    events.awaitingInput(s, eventBus, unanswered);

    // We *end* the graph here; UI will POST answers to /runs/:id/confirm to resume
    return { output: { ...s.output } };
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

  if (!needsApproval(s, policy)) {
    return;
  }

  const approvalId = randomUUID();
  events.approvalAwaiting(s, eventBus, pending);

  const err: any = new Error('GRAPH_HALT_AWAITING_APPROVAL');
  err.code = 'GRAPH_HALT_AWAITING_APPROVAL';
  err.approvalId = approvalId;
  err.payload = { approvalId, pendingSteps: pending };
  throw err;
};
