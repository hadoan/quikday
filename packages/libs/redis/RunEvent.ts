export interface RunEvent {
  type:
    | 'connection_established'
    | 'run_status'
    | 'run_completed'
    | 'step_succeeded'
    | 'step_failed'
    | 'plan_generated'
    | 'step_started';
  runId: string;
  payload: any;
  ts: string;
}
