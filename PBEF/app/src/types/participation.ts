/**
 * participation.ts
 * ================
 * PBEF Component 3 — Participation Forecasting Data Contracts
 * Defines standard UI-level types for session events, activity snapshots,
 * forecasting outputs, and educator intervention actions.
 */

export type InputMode =
  | 'interactive_session'
  | 'recorded_session'
  | 'simulated_session';

export type ParticipationState =
  | 'active'
  | 'reduced_interaction'
  | 'insufficient_data';

export type SessionEventType =
  | 'answer_submitted'
  | 'answer_selected'
  | 'answer_correct'
  | 'answer_incorrect'
  | 'stimulus_presented'
  | 'hint_requested'
  | 'hint_delivered'
  | 'task_started'
  | 'task_completed'
  | 'touch'
  | 'pause_started'
  | 'pause_ended'
  | 'idle_pause';

export interface SessionEvent {
  event_id: string;
  session_id: string;
  timestamp_sec: number;
  type: SessionEventType;
  task_id?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ActivitySnapshot {
  timestamp_sec: number;
  answer_attempts_30s: number;
  correct_answers_30s: number;
  mean_response_latency_ms: number | null;
  inactivity_sec: number;
  data_valid: boolean;
}

export type PredictionStatus =
  | 'valid'
  | 'warming_up'
  | 'insufficient_data'
  | 'model_error';

export type ForecastSource =
  | 'onnx_interaction_only'
  | 'heuristic_baseline';

export interface ForecastResult {
  session_id: string;
  timestamp_sec: number;
  horizon_sec: 20;
  risk_probability: number | null;
  alert_threshold: number;
  prediction_status: PredictionStatus;
  model_source: ForecastSource;
  model_version: string;
  evidence: string[];
  missing_channels?: string[];
  input_mode: InputMode;
  camera_enabled: false;
}

export interface TeacherAction {
  action_id: string;
  session_id: string;
  timestamp_sec: number;
  type:
    | 'acknowledged'
    | 'dismissed'
    | 'offer_hint'
    | 'offer_break'
    | 'offer_task_adjustment'
    | 'continue_monitoring';
  note?: string;
}

export type ReviewStatus = 'normal' | 'elevated' | 'review_pending' | 'reviewed' | 'insufficient_data';

export interface TeacherReviewEpisode {
  id: string;
  triggerTimeSec: number;
  triggerRisk: number;
  peakRisk?: number;
  triggerLatencyMs: number;
  triggerInactivitySec: number;
  status: 'pending' | 'reviewed';
  acknowledgedAt?: number;
  teacherAction?: string;
  teacherNote?: string;
  evidenceSummary?: string[];
}
