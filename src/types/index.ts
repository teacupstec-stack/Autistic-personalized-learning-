export type {
  Timestamp,
  RiskSignal,
  Snapshot,
  Decision,
  EventBase,
  DecisionEvent,
  OutcomeEvent,
  LogEvent,
  ContractKind
} from '../../contracts/types';

export interface Activity {
  activity_id: string;
  title: string;
  description: string;
  target_skill: string;
  difficulty: 'easy' | 'medium';
  presentation: 'visual' | 'text';
  item_count: number;
  prompt_text: string;
  options: number[];
  correct_answer: number;
  teacher_approved: boolean;
  variant_code: 'easy_visual' | 'easy_text' | 'medium_visual' | 'medium_text';
}

export type ActionVariant = 'easy_visual' | 'easy_text' | 'medium_visual' | 'medium_text';

export type SessionStatus =
  | 'idle'
  | 'loading'
  | 'active'
  | 'break_requested'
  | 'break_active'
  | 'intervention_required'
  | 'completed'
  | 'error';

export interface LearnerProfile {
  profile_id: string;
  name: string;
  family: 'additive_skill' | 'threshold_mastery' | 'fatigue_recovery';
  starting_skill: number;
  current_skill: number;
  visual_preference: number; // positive = prefers visual, negative = prefers text
  consecutive_failures: number;
  consecutive_tasks_without_break: number;
  avatar: string;
  description: string;
}

export type PolicyType =
  | 'SCPA_Full'
  | 'SCPA_NoSharedSignals'
  | 'SCPA_NoConfidenceWeight'
  | 'Educator_Rules'
  | 'Fixed_Sequencing'
  | 'Linear_Bandit';

export type AppRoute =
  | 'overview'
  | 'teacher'
  | 'activities'
  | 'learner'
  | 'break'
  | 'safety'
  | 'research'
  | 'events';

export interface TeacherLimits {
  approved_actions: ActionVariant[];
  allowed_actions: ActionVariant[];
  max_failure_sequence: number;
}

export interface ExplainabilityData {
  selected_action: ActionVariant | null;
  scores: Record<ActionVariant, number>;
  eligible_actions: ActionVariant[];
  c3_risk_level: number;
  c3_confidence: number;
  c3_status: 'known' | 'unknown';
  c3_expired: boolean;
  reason: string;
  context_features: {
    skill_estimate: number;
    success_rate: number;
    independence_rate: number;
    hint_frequency: number;
    c3_weighted_risk: number;
    c3_confidence: number;
    c3_is_known: number;
    c3_is_missing: number;
    consecutive_failures: number;
  };
}

export interface PolicyEvaluationMetric {
  policy_name: string;
  mean_cumulative_reward: number;
  ci_95: [number, number];
  constraint_violations: number;
  mean_one_step_regret: number;
  max_failure_run: number;
  mean_failure_run: number;
  success_rate: number;
  independence_rate: number;
  evaluated_episodes: number;
}

export interface EvaluationData {
  evaluation_status: string;
  held_out_profiles_count: number;
  unseen_families: string[];
  policies_compared: string[];
  results: PolicyEvaluationMetric[];
}
