import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { needsApproval } from '../guards/policy';
import { events } from '../observability/events';
import { randomUUID } from 'node:crypto';

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  // Feature toggle: approvals can be disabled via ctx.meta.approvalsEnabled or env
  // Default: disabled (can be re-enabled later)
  const metaFlag = (s.ctx as any)?.meta?.approvalsEnabled;
  const envFlag = (process.env.AGENT_APPROVALS_ENABLED ?? 'false').toString().toLowerCase();
  const approvalsEnabled = typeof metaFlag === 'boolean' ? metaFlag : envFlag === 'true';

  // Missing-input prompting moved to classify stage; no questions handling here.

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
