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

  // If there are any 'missing' questions recorded on scratch, see if the
  // runtime.scratch now contains answers for some of them and remove
  // resolved items so the graph can proceed without re-asking.
  const missing = Array.isArray((s.scratch as any)?.missing) ? ((s.scratch as any).missing as any[]) : [];
  if (missing.length) {
    const getByPath = (obj: any, path: string) => {
      if (!obj || !path) return undefined;
      const parts = path.split('.');
      let cur: any = obj;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    };

    const unresolved = missing.filter((q: any) => {
      const val = getByPath(s.scratch, q.key);
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    });

    // mutate scratch so the graph hooks will emit a node.exit delta and
    // subscribers (UI) will observe the updated missing list.
    if (unresolved.length !== missing.length) {
      s.scratch = { ...(s.scratch ?? {}), missing: unresolved } as any;
    }
  }

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
