/**
 * C2 Decision and Outcome Event Logger.
 * Strictly adheres to contracts/schema.json and types.ts.
 */
import type { Snapshot, Decision, DecisionEvent, OutcomeEvent, Timestamp } from './types';
import { validate, validatePair } from './validate';

export function createDecisionEvent(
  eventId: string,
  decisionId: string,
  learnerId: string,
  sessionId: string,
  decisionTime: Timestamp,
  contextBeforeAction: Snapshot,
  eligibleActions: string[],
  selectedAction: string | null,
  actionPropensity: number | null,
  reason: string = 'policy_selection',
  modelVersion: string = 'c2-v0.1.0',
  simulatorProfile = {
    family: 'additive_skill',
    profile_id: 'sim_default',
    generator_version: 'sim-v1',
    seed: 42
  }
): DecisionEvent {
  const decision: Decision = {
    action_id: selectedAction,
    eligible_actions: eligibleActions,
    confidence: null,
    reason,
    model_version: modelVersion
  };

  const event: DecisionEvent = {
    event_id: eventId,
    decision_id: decisionId,
    learner_id: learnerId,
    session_id: sessionId,
    decision_time: decisionTime,
    source: 'simulated',
    simulator_profile: simulatorProfile,
    event_type: 'decision',
    context_before_action: contextBeforeAction,
    eligible_actions: eligibleActions,
    selected_action: selectedAction,
    action_propensity: actionPropensity,
    decision
  };

  const validation = validate('log_event', event);
  if (!validation.valid) {
    throw new Error(`Invalid DecisionEvent generated: ${JSON.stringify(event)}`);
  }

  return event;
}

export function createOutcomeEvent(
  eventId: string,
  decisionId: string,
  learnerId: string,
  sessionId: string,
  decisionTime: Timestamp,
  outcomeTime: Timestamp,
  selectedAction: string,
  outcome: boolean,
  independence: boolean,
  override: boolean = false,
  distressPresent: boolean = false,
  simulatorProfile = {
    family: 'additive_skill',
    profile_id: 'sim_default',
    generator_version: 'sim-v1',
    seed: 42
  }
): OutcomeEvent {
  const event: OutcomeEvent = {
    event_id: eventId,
    decision_id: decisionId,
    learner_id: learnerId,
    session_id: sessionId,
    decision_time: decisionTime,
    source: 'simulated',
    simulator_profile: simulatorProfile,
    event_type: 'outcome',
    outcome_time: outcomeTime,
    selected_action: selectedAction,
    outcome,
    independence,
    override,
    distress_annotation: distressPresent ? { present: true, annotator: 'simulator' } : null
  };

  const validation = validate('log_event', event);
  if (!validation.valid) {
    throw new Error(`Invalid OutcomeEvent generated: ${JSON.stringify(event)}`);
  }

  return event;
}
