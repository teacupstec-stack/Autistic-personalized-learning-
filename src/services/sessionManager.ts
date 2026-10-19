import type {
  Snapshot,
  Decision,
  DecisionEvent,
  OutcomeEvent,
  LogEvent,
  ActionVariant,
  SessionStatus,
  LearnerProfile,
  TeacherLimits,
  Activity,
  ExplainabilityData,
  PolicyType
} from '../types';
import { createPolicy, SCPABanditPolicy } from './policyEngine';
import { getRandomActivityForVariant, ACTIVITIES } from './activityService';
import { validate, validatePair, effectiveC3 } from '../../contracts/validate';

export const DEFAULT_TEACHER_LIMITS: TeacherLimits = {
  approved_actions: ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'],
  allowed_actions: ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'],
  max_failure_sequence: 3
};

export const PRESET_LEARNERS: LearnerProfile[] = [
  {
    profile_id: 'sim_learner_042',
    name: 'Alex (Visual Explorer)',
    family: 'additive_skill',
    starting_skill: 0.50,
    current_skill: 0.52,
    visual_preference: 0.85,
    consecutive_failures: 0,
    consecutive_tasks_without_break: 0,
    avatar: '🧒',
    description: 'Thrives with high-contrast visual items (apples, stars, fish). Prefers visual counting over dense text story rhymes.'
  },
  {
    profile_id: 'sim_learner_003',
    name: 'Emma (Story Listener)',
    family: 'threshold_mastery',
    starting_skill: 0.35,
    current_skill: 0.38,
    visual_preference: -0.60,
    consecutive_failures: 0,
    consecutive_tasks_without_break: 0,
    avatar: '👧',
    description: 'Responds warmly to rhythmic story rhyme activities (kittens, bees, puppies). Shows clear step mastery transitions.'
  },
  {
    profile_id: 'sim_learner_011',
    name: 'Jordan (Sensory Sensitive)',
    family: 'fatigue_recovery',
    starting_skill: 0.45,
    current_skill: 0.45,
    visual_preference: 0.30,
    consecutive_failures: 0,
    consecutive_tasks_without_break: 2,
    avatar: '🧑',
    description: 'Benefits from calm colors and predictable pacing. Performance is sensitive to fatigue without regular calm breaks.'
  }
];

export interface SessionStepRecord {
  step: number;
  activity: Activity;
  decisionEvent: DecisionEvent;
  outcomeEvent?: OutcomeEvent;
  explainability: ExplainabilityData;
  hintsUsed: number;
  reward?: number;
  isBreakBypassed?: boolean;
}

export class SessionManager {
  learner: LearnerProfile;
  teacherLimits: TeacherLimits;
  policy: ReturnType<typeof createPolicy>;
  policyType: PolicyType;
  status: SessionStatus = 'idle';
  stepCount = 0;
  consecutiveFailures = 0;
  consecutiveTasksWithoutBreak = 0;

  currentActivity: Activity | null = null;
  currentDecisionEvent: DecisionEvent | null = null;
  currentExplainability: ExplainabilityData | null = null;
  currentHintsUsed = 0;

  recentResults: { decision_id: string; outcome_time: string; success: boolean; independent: boolean }[] = [];
  hintHistory: { time: string; count: number }[] = [];
  confirmedRequests: { kind: 'help' | 'break'; confirmed_at: string }[] = [];
  history: SessionStepRecord[] = [];
  allEvents: LogEvent[] = [];

  // Simulated C3 Affective Risk Signal
  c3RiskValue = 0.25;
  c3Confidence = 0.85;
  c3ObservedAt: string = new Date(Date.now() - 10000).toISOString();
  c3ExpiresAt: string = new Date(Date.now() + 180000).toISOString();

  private lastTimestampMs = Date.now() - 100000;

  private getNextTimestamp(offsetMs = 100): string {
    const now = Math.max(Date.now(), this.lastTimestampMs + offsetMs);
    this.lastTimestampMs = now;
    return new Date(now).toISOString();
  }

  constructor(
    learner: LearnerProfile = PRESET_LEARNERS[0],
    limits: TeacherLimits = DEFAULT_TEACHER_LIMITS,
    policyType: PolicyType = 'SCPA_Full'
  ) {
    this.learner = { ...learner };
    this.teacherLimits = {
      approved_actions: [...limits.approved_actions],
      allowed_actions: [...limits.allowed_actions],
      max_failure_sequence: limits.max_failure_sequence
    };
    this.policyType = policyType;
    this.policy = createPolicy(policyType);
  }

  setPolicy(type: PolicyType): void {
    this.policyType = type;
    this.policy = createPolicy(type);
  }

  setLearner(learner: LearnerProfile): void {
    this.learner = { ...learner };
    this.resetSession();
  }

  updateTeacherLimits(newLimits: Partial<TeacherLimits>): { valid: boolean; error?: string } {
    const candidateApproved = newLimits.approved_actions || this.teacherLimits.approved_actions;
    const candidateAllowed = newLimits.allowed_actions || this.teacherLimits.allowed_actions;
    const candidateMaxFail = newLimits.max_failure_sequence ?? this.teacherLimits.max_failure_sequence;

    // Safety Invariant: candidateAllowed must be a subset of candidateApproved
    const isSubset = candidateAllowed.every(a => candidateApproved.includes(a));
    if (!isSubset) {
      return {
        valid: false,
        error: 'Teacher safety constraint violated: Allowed actions must be a strict subset of approved actions.'
      };
    }

    if (candidateAllowed.length === 0) {
      return {
        valid: false,
        error: 'At least one certified activity must be allowed in the session.'
      };
    }

    if (candidateMaxFail < 1) {
      return {
        valid: false,
        error: 'Consecutive failure threshold must be at least 1.'
      };
    }

    this.teacherLimits = {
      approved_actions: [...candidateApproved],
      allowed_actions: [...candidateAllowed],
      max_failure_sequence: candidateMaxFail
    };

    return { valid: true };
  }

  buildSnapshot(decisionTime: string): Snapshot {
    const decMs = new Date(decisionTime).getTime();
    const observedMs = Math.min(new Date(this.c3ObservedAt).getTime(), decMs - 1000);
    const expiresMs = Math.max(new Date(this.c3ExpiresAt).getTime(), observedMs + 60000);

    return {
      snapshot_id: `snap_${this.learner.profile_id}_${this.stepCount + 1}`,
      decision_time: decisionTime,
      skill_estimate: this.learner.current_skill,
      recent_results: this.recentResults.slice(-5),
      hint_history: this.hintHistory.slice(-5),
      confirmed_requests: this.confirmedRequests.slice(-5),
      c3_risk: {
        value: Math.min(0.95, Math.max(0.1, this.c3RiskValue + 0.15 * this.consecutiveFailures)),
        confidence: this.c3Confidence,
        observed_at: new Date(observedMs).toISOString(),
        expires_at: new Date(expiresMs).toISOString()
      },
      teacher_limits: {
        approved_actions: [...this.teacherLimits.approved_actions],
        allowed_actions: [...this.teacherLimits.allowed_actions],
        max_failure_sequence: this.teacherLimits.max_failure_sequence
      }
    };
  }

  startSession(): void {
    this.status = 'active';
    this.nextTask();
  }

  pauseSession(): void {
    if (this.status === 'active') {
      this.status = 'idle';
    }
  }

  resumeSession(): void {
    if (this.status === 'idle' || this.status === 'break_active') {
      this.status = 'active';
      // Once resumed, break state is concluded
      this.confirmedRequests = this.confirmedRequests.filter(r => r.kind !== 'break');
      if (!this.currentActivity) {
        this.nextTask();
      }
    }
  }

  endSession(): void {
    this.status = 'completed';
    this.currentActivity = null;
    this.currentDecisionEvent = null;
  }

  resetSession(): void {
    this.status = 'idle';
    this.stepCount = 0;
    this.consecutiveFailures = 0;
    this.consecutiveTasksWithoutBreak = 0;
    this.currentActivity = null;
    this.currentDecisionEvent = null;
    this.currentExplainability = null;
    this.currentHintsUsed = 0;
    this.recentResults = [];
    this.hintHistory = [];
    this.confirmedRequests = [];
    this.history = [];
    this.allEvents = [];
    this.policy.reset();
  }

  unlockTripwire(customMaxFailure?: number): void {
    this.consecutiveFailures = 0;
    if (customMaxFailure && customMaxFailure >= 1) {
      this.teacherLimits.max_failure_sequence = customMaxFailure;
    }
    this.status = 'active';
    this.nextTask();
  }

  nextTask(): { activity: Activity | null; tripwireTriggered: boolean } {
    // 1. Safety Tripwire Check
    if (this.consecutiveFailures >= this.teacherLimits.max_failure_sequence) {
      this.status = 'intervention_required';
      this.currentActivity = null;
      this.currentDecisionEvent = null;

      const decTime = this.getNextTimestamp();
      const snapshot = this.buildSnapshot(decTime);

      // Create null decision event when safety tripwire is activated
      const nullDecision: Decision = {
        action_id: null,
        eligible_actions: [],
        confidence: null,
        reason: `Teacher safety tripwire triggered (${this.consecutiveFailures} consecutive failures reached). Automated selection halted for educator intervention.`,
        model_version: 'c2-scpa-v1.0.0'
      };

      const decisionEvent: DecisionEvent = {
        event_id: `evt_dec_tripwire_${this.stepCount + 1}_${Date.now()}`,
        decision_id: `dec_tripwire_${this.stepCount + 1}`,
        learner_id: this.learner.profile_id,
        session_id: `sim_session_${this.learner.profile_id}`,
        decision_time: decTime,
        source: 'simulated',
        simulator_profile: {
          family: this.learner.family,
          profile_id: this.learner.profile_id,
          generator_version: 'sim-v1',
          seed: 42
        },
        event_type: 'decision',
        context_before_action: snapshot,
        eligible_actions: [],
        selected_action: null,
        action_propensity: null,
        decision: nullDecision
      };

      this.currentDecisionEvent = decisionEvent;
      this.allEvents.push(decisionEvent);

      return { activity: null, tripwireTriggered: true };
    }

    // 2. Eligible Actions: Strictly constrained to teacher-allowed actions
    const eligibleActions: ActionVariant[] = [...this.teacherLimits.allowed_actions];

    // 3. Build canonical UTC snapshot
    const decTime = this.getNextTimestamp();
    const snapshot = this.buildSnapshot(decTime);

    // 4. Model Decision via SCPA / Selected Policy
    const { selected_action, explainability } = this.policy.selectAction(snapshot, eligibleActions);
    this.currentExplainability = explainability;

    if (!selected_action) {
      this.status = 'intervention_required';
      this.currentActivity = null;
      return { activity: null, tripwireTriggered: true };
    }

    // 5. Select corresponding certified activity
    const activity = getRandomActivityForVariant(
      selected_action,
      this.currentActivity?.activity_id
    );

    this.currentActivity = activity;
    this.currentHintsUsed = 0;
    this.stepCount++;
    this.consecutiveTasksWithoutBreak++;

    // 6. Build and validate canonical DecisionEvent
    const decision: Decision = {
      action_id: selected_action,
      eligible_actions: eligibleActions,
      confidence: null,
      reason: explainability.reason,
      model_version: 'c2-scpa-v1.0.0'
    };

    const decisionEvent: DecisionEvent = {
      event_id: `evt_dec_${this.stepCount}_${Date.now()}`,
      decision_id: `dec_${this.stepCount}_${Date.now()}`,
      learner_id: this.learner.profile_id,
      session_id: `sim_session_${this.learner.profile_id}`,
      decision_time: decTime,
      source: 'simulated',
      simulator_profile: {
        family: this.learner.family,
        profile_id: this.learner.profile_id,
        generator_version: 'sim-v1',
        seed: 42
      },
      event_type: 'decision',
      context_before_action: snapshot,
      eligible_actions: eligibleActions,
      selected_action: selected_action,
      action_propensity: 1.0 / eligibleActions.length,
      decision
    };

    // Contract validation check
    const valResult = validate('log_event', decisionEvent);
    if (!valResult.valid) {
      console.warn('DecisionEvent validation warning:', valResult);
    }

    this.currentDecisionEvent = decisionEvent;
    this.allEvents.push(decisionEvent);

    return { activity, tripwireTriggered: false };
  }

  requestHint(): string {
    this.currentHintsUsed++;
    const now = this.getNextTimestamp();
    this.hintHistory.push({ time: now, count: this.currentHintsUsed });

    const count = this.currentActivity?.item_count || 3;
    const hints = [
      `Count them slowly one by one: 1, 2, ... up to ${count}!`,
      `Let's point to each one together! Start from the left: 1, 2...`,
      `You are doing wonderful! There are ${count} items in total.`
    ];

    return hints[Math.min(this.currentHintsUsed - 1, hints.length - 1)];
  }

  requestBreak(): void {
    // Non-Negotiable Contract Requirement:
    // Break request BYPASSES C2 selection policy immediately.
    // Zero negative reward. No posterior update. No streak penalty.
    const now = this.getNextTimestamp();
    this.confirmedRequests.push({ kind: 'break', confirmed_at: now });
    this.status = 'break_active';
    this.consecutiveTasksWithoutBreak = 0;

    // Refresh affective risk signal on break
    this.c3RiskValue = Math.max(0.15, this.c3RiskValue - 0.20);
    this.c3ObservedAt = now;
    this.c3ExpiresAt = new Date(Date.now() + 180000).toISOString();
  }

  submitAnswer(selectedOption: number): {
    correct: boolean;
    reward: number;
    tripwireTriggered: boolean;
    correctAnswer: number;
  } {
    if (!this.currentActivity || !this.currentDecisionEvent) {
      throw new Error('No active task to submit an answer for.');
    }

    const activity = this.currentActivity;
    const decisionEvent = this.currentDecisionEvent;
    const decTime = decisionEvent.decision_time;

    // Outcome time strictly > decision_time
    const outcomeTime = this.getNextTimestamp();
    const correct = selectedOption === activity.correct_answer;
    const independent = this.currentHintsUsed === 0;

    // Reward calculation adhering strictly to research configuration:
    // Success: 0.70*1 + 0.30*(independent? 1 : 0) - hint_penalty(0.05 * min(hints, 4))
    // Failure: -0.30
    let reward = 0.0;
    if (correct) {
      const hintPenalty = 0.05 * Math.min(this.currentHintsUsed, 4);
      reward = Number((0.70 * 1.0 + (independent ? 0.30 : 0.0) - hintPenalty).toFixed(2));
      this.consecutiveFailures = 0;
      this.learner.current_skill = Math.min(0.95, this.learner.current_skill + 0.02);
      this.c3RiskValue = Math.max(0.1, this.c3RiskValue - 0.05);
    } else {
      reward = -0.30;
      this.consecutiveFailures++;
      this.c3RiskValue = Math.min(0.9, this.c3RiskValue + 0.20);
    }

    // Posterior update on selected action
    this.policy.update(decisionEvent.context_before_action, activity.variant_code, reward);

    // Build canonical OutcomeEvent
    const outcomeEvent: OutcomeEvent = {
      event_id: `evt_out_${this.stepCount}_${Date.now()}`,
      decision_id: decisionEvent.decision_id,
      learner_id: this.learner.profile_id,
      session_id: `sim_session_${this.learner.profile_id}`,
      decision_time: decTime,
      source: 'simulated',
      simulator_profile: {
        family: this.learner.family,
        profile_id: this.learner.profile_id,
        generator_version: 'sim-v1',
        seed: 42
      },
      event_type: 'outcome',
      outcome_time: outcomeTime,
      selected_action: activity.variant_code,
      outcome: correct,
      independence: independent,
      override: false,
      distress_annotation: this.c3RiskValue >= 0.70 ? { present: true, annotator: 'simulator' } : null
    };

    // Contract validation of outcome event and pair
    const valOutcome = validate('log_event', outcomeEvent);
    const valPair = validatePair(decisionEvent, outcomeEvent);

    if (!valOutcome.valid || !valPair) {
      console.warn('OutcomeEvent contract validation note:', { valOutcome, valPair });
    }

    this.allEvents.push(outcomeEvent);

    this.recentResults.push({
      decision_id: decisionEvent.decision_id,
      outcome_time: outcomeTime,
      success: correct,
      independent
    });

    if (this.currentExplainability) {
      this.history.push({
        step: this.stepCount,
        activity,
        decisionEvent,
        outcomeEvent,
        explainability: this.currentExplainability,
        hintsUsed: this.currentHintsUsed,
        reward
      });
    }

    const tripwireTriggered = this.consecutiveFailures >= this.teacherLimits.max_failure_sequence;
    if (tripwireTriggered) {
      this.status = 'intervention_required';
    }

    return {
      correct,
      reward,
      tripwireTriggered,
      correctAnswer: activity.correct_answer
    };
  }

  // Refresh or expire C3 affective signal for testing/demo
  setMockC3Risk(value: number, confidence: number, isExpired = false): void {
    const now = new Date();
    this.c3RiskValue = value;
    this.c3Confidence = confidence;
    this.c3ObservedAt = now.toISOString();
    this.c3ExpiresAt = isExpired
      ? new Date(now.getTime() - 60000).toISOString() // expired 1 min ago
      : new Date(now.getTime() + 180000).toISOString(); // expires in 3 min
  }
}
