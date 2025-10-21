import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';
import { needsApproval } from '../guards/policy';

export const confirm: Node<RunState> = async (s) => {
  if (needsApproval(s)) {
    // If Approvals integration is present, enqueue; otherwise fallback to no-op
    try {
      // dynamic require to avoid build-time dependency
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const Approvals = require('../../policy-engine').Approvals;
      if (Approvals?.enqueue) {
        await Approvals.enqueue({
          runId: s.ctx.runId,
          teamId: s.ctx.teamId ?? undefined,
          steps: s.scratch?.plan ?? [],
        });
      }
    } catch {
      // no-op in build/stub environment
    }
  }
};
