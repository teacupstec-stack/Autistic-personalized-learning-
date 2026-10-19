/** Wire timestamps are canonical UTC ISO strings with exactly 3 fractional digits. */
export type Timestamp = string;
export interface RiskSignal { value: number; confidence: number; observed_at: Timestamp; expires_at: Timestamp }
export interface Snapshot {
  snapshot_id: string;
  decision_time: Timestamp;
  skill_estimate: number | null;
  recent_results: {decision_id: string; outcome_time: Timestamp; success: boolean; independent: boolean}[];
  hint_history: {time: Timestamp; count: number}[];
  confirmed_requests: {kind: 'help' | 'break'; confirmed_at: Timestamp}[];
  c3_risk?: RiskSignal | null;
  teacher_limits: {approved_actions: string[]; allowed_actions: string[]; max_failure_sequence: number};
}
export interface Decision {
  action_id: string | null;
  eligible_actions: string[];
  /** Not yet assigned research semantics; use null until approved. */
  confidence: number | null;
  reason: string;
  model_version: string;
}
export interface EventBase {
  event_id: string; decision_id: string; learner_id: string; session_id: string;
  decision_time: Timestamp; source: 'simulated';
  simulator_profile: {family: string; profile_id: string; generator_version: string; seed: number};
}
export interface DecisionEvent extends EventBase {
  event_type: 'decision'; context_before_action: Snapshot;
  eligible_actions: string[]; selected_action: string | null;
  action_propensity: number | null; decision: Decision;
}
export interface OutcomeEvent extends EventBase {
  event_type: 'outcome'; outcome_time: Timestamp; selected_action: string;
  outcome: boolean; independence: boolean; override: boolean;
  distress_annotation: {present: boolean; annotator: 'simulator'} | null;
}
export type LogEvent = DecisionEvent | OutcomeEvent;
export type ContractKind = 'snapshot' | 'decision' | 'log_event';
