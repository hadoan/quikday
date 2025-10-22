export interface RunEvent {
  type:
    | 'connection_established'
    | 'run_status'
    | 'run_completed'
    | 'step_started'
    | 'step_succeeded'
    | 'step_failed'
    | 'plan_generated'
    | 'node.enter'
    | 'node.exit'
    | 'edge.taken'
    | 'tool.called'
    | 'tool.succeeded'
    | 'tool.failed'
    | 'plan.ready'
    | 'fallback'
    | 'approval.awaiting'
    | 'undo.enqueued'
    | 'undo.completed';
  runId: string;
  payload: any;
  ts: string;
}
