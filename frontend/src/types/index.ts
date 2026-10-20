/**
 * Core type definitions for PUSG-Fusion (Component 1)
 * Intentional communication via picture symbols and enrolled gestures.
 */

export type IntentMessage = 'Help' | 'Break' | 'Finished' | 'Yes' | 'No';

export type ModelStatusType = 'not_loaded' | 'ready' | 'error';

export interface PictureSymbol {
  id: string;
  intent: IntentMessage;
  label: string;
  description: string;
  iconName: string;
  colorTheme: {
    bg: string;
    border: string;
    text: string;
    accent: string;
    hoverBg: string;
  };
  keyboardShortcut: string;
}

export interface ActivityContext {
  activityId: string;
  activityName: string;
  currentCount: number;
  targetCount: number;
  status: 'idle' | 'in_progress' | 'completed';
  notes?: string;
}

export type EventSource = 'learner_symbol' | 'gesture_model' | 'teacher_enrolment' | 'clarification';
export type CommunicationModality = 'symbol' | 'gesture' | 'multimodal' | 'system' | 'teacher';

export interface SessionEvent {
  id: string;
  timestamp: string; // ISO 8601
  eventType: 
    | 'symbol_selected'
    | 'gesture_capture_started'
    | 'gesture_capture_completed'
    | 'clarification_prompted'
    | 'clarification_resolved'
    | 'clarification_cancelled'
    | 'teacher_enrolment_saved'
    | 'activity_step'
    | 'activity_reset'
    | 'camera_permission_changed';
  modality: CommunicationModality;
  source: EventSource;
  intent?: IntentMessage | null;
  activityContext: ActivityContext;
  modelStatus: ModelStatusType;
  details: string;
  rawConfidence?: number;
}

export interface EnrolledGestureSample {
  sampleId: string;
  timestamp: string;
  durationMs: number;
  notes: string;
}

export interface EnrolledIntentMapping {
  intent: IntentMessage;
  gestureDescription: string;
  status: 'enrolled' | 'pending' | 'unassigned';
  samplesCount: number;
  lastUpdated?: string;
  samples: EnrolledGestureSample[];
}

export interface ParticipantProfile {
  participantId: string;
  pseudonym: string;
  sessionId: string;
  consentConfirmed: boolean;
  notes: string;
}

export interface ClarificationState {
  isOpen: boolean;
  suspectedIntent: IntentMessage | null;
  confidenceScore?: number;
  reason: 'low_confidence' | 'modality_conflict' | 'teacher_check' | 'no_model_fallback';
  conflictingSymbol?: IntentMessage | null;
}
