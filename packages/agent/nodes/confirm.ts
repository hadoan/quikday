import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { needsApproval } from '../guards/policy';
import { events } from '../observability/events';
import { randomUUID } from 'node:crypto';

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const policy = (s.ctx as any).meta?.policy;
  const approvedSteps = new Set<string>(
    Array.isArray((s.ctx as any).meta?.approvedSteps)
      ? ((s.ctx as any).meta.approvedSteps as string[])
      : [],
  );

  const plan = s.scratch?.plan ?? [];
  const pending = plan.filter((step) => !approvedSteps.has(step.id));

  if (!pending.length) {
    return;
  }

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
