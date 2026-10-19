import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager, PRESET_LEARNERS, DEFAULT_TEACHER_LIMITS } from '../services/sessionManager';
import { validate, validatePair } from '../../contracts/validate';

describe('SessionManager & C2 Contract Safety Invariants', () => {
  let session: SessionManager;

  beforeEach(() => {
    session = new SessionManager(PRESET_LEARNERS[0], DEFAULT_TEACHER_LIMITS, 'SCPA_Full');
  });

  it('initializes in idle state with teacher limits strictly configured', () => {
    expect(session.status).toBe('idle');
    expect(session.teacherLimits.allowed_actions.length).toBe(4);
    expect(session.teacherLimits.max_failure_sequence).toBe(3);
    expect(session.consecutiveFailures).toBe(0);
  });

  it('enforces that allowed actions must strictly be a subset of approved actions', () => {
    // Valid subset update
    const validRes = session.updateTeacherLimits({
      allowed_actions: ['easy_visual', 'easy_text']
    });
    expect(validRes.valid).toBe(true);
    expect(session.teacherLimits.allowed_actions).toEqual(['easy_visual', 'easy_text']);

    // Invalid update: attempting to add an unapproved action
    const invalidRes = session.updateTeacherLimits({
      allowed_actions: ['unapproved_hack' as any]
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.error).toContain('safety constraint violated');

    // Invalid update: empty allowed actions
    const emptyRes = session.updateTeacherLimits({
      allowed_actions: []
    });
    expect(emptyRes.valid).toBe(false);
    expect(emptyRes.error).toContain('At least one certified activity');
  });

  it('starts session, selects activity, and logs validated DecisionEvent', () => {
    session.startSession();
    expect(session.status).toBe('active');
    expect(session.currentActivity).not.toBeNull();
    expect(session.currentDecisionEvent).not.toBeNull();

    // Verify DecisionEvent against JSON Schema & Invariants
    const valResult = validate('log_event', session.currentDecisionEvent!);
    expect(valResult.valid).toBe(true);
  });

  it('calculates reward correctly on independent success vs hint-assisted success vs failure', () => {
    session.startSession();
    const correctAns = session.currentActivity!.correct_answer;

    // 1. Independent success (0 hints)
    // Reward = 0.70 * 1.0 + 0.30 - 0.00 = 1.00
    const res1 = session.submitAnswer(correctAns);
    expect(res1.correct).toBe(true);
    expect(res1.reward).toBe(1.00);
    expect(session.consecutiveFailures).toBe(0);

    // Prepare next task
    session.nextTask();
    // 2. Hint-assisted success (1 hint used)
    session.requestHint();
    const correctAns2 = session.currentActivity!.correct_answer;
    // Reward = 0.70 * 1.0 + 0.00 - (0.05 * 1) = 0.65
    const res2 = session.submitAnswer(correctAns2);
    expect(res2.correct).toBe(true);
    expect(res2.reward).toBe(0.65);
    expect(session.consecutiveFailures).toBe(0);

    // Prepare next task
    session.nextTask();
    // 3. Incorrect answer
    const incorrectAns = session.currentActivity!.options.find(
      opt => opt !== session.currentActivity!.correct_answer
    ) || 999;
    const res3 = session.submitAnswer(incorrectAns);
    expect(res3.correct).toBe(false);
    expect(res3.reward).toBe(-0.30);
    expect(session.consecutiveFailures).toBe(1);
  });

  it('triggers Safety Tripwire when consecutive failures reach threshold', () => {
    session.startSession();
    expect(session.teacherLimits.max_failure_sequence).toBe(3);

    // Fail 1
    let act = session.currentActivity!;
    let wrong = act.options.find(o => o !== act.correct_answer)!;
    session.submitAnswer(wrong);
    expect(session.consecutiveFailures).toBe(1);
    expect(session.status).toBe('active');

    // Fail 2
    session.nextTask();
    act = session.currentActivity!;
    wrong = act.options.find(o => o !== act.correct_answer)!;
    session.submitAnswer(wrong);
    expect(session.consecutiveFailures).toBe(2);
    expect(session.status).toBe('active');

    // Fail 3 (Threshold reached)
    session.nextTask();
    act = session.currentActivity!;
    wrong = act.options.find(o => o !== act.correct_answer)!;
    const res3 = session.submitAnswer(wrong);
    expect(session.consecutiveFailures).toBe(3);
    expect(res3.tripwireTriggered).toBe(true);
    expect(session.status).toBe('intervention_required');

    // Next task request while tripped MUST halt selection and output action_id = null
    const nextRes = session.nextTask();
    expect(nextRes.tripwireTriggered).toBe(true);
    expect(nextRes.activity).toBeNull();
    expect(session.currentDecisionEvent?.decision.action_id).toBeNull();
    expect(session.currentDecisionEvent?.eligible_actions).toEqual([]);
  });

  it('respects Break Bypass Contract: zero reward, no posterior update, no failure streak increment', () => {
    session.startSession();
    session.consecutiveFailures = 1; // Prior failure
    const initialSkill = session.learner.current_skill;

    // Student requests break
    session.requestBreak();
    expect(session.status).toBe('break_active');

    // Verify streak and skill are completely preserved
    expect(session.consecutiveFailures).toBe(1); // Not incremented!
    expect(session.learner.current_skill).toBe(initialSkill); // Not degraded!

    // Resuming from break returns to active state safely
    session.resumeSession();
    expect(session.status).toBe('active');
    expect(session.consecutiveFailures).toBe(1);
  });

  it('allows teacher to safely unlock and reset session after assistance', () => {
    session.consecutiveFailures = 3;
    session.status = 'intervention_required';

    session.unlockTripwire(4); // Reset and adjust threshold to 4
    expect(session.consecutiveFailures).toBe(0);
    expect(session.status).toBe('active');
    expect(session.teacherLimits.max_failure_sequence).toBe(4);
    expect(session.currentActivity).not.toBeNull();
  });

  it('strictly validates DecisionEvent and OutcomeEvent pairs against contract schema', () => {
    session.startSession();
    const decEvt = session.currentDecisionEvent!;
    const correctAns = session.currentActivity!.correct_answer;
    session.submitAnswer(correctAns);

    const outEvt = session.allEvents.find(e => e.event_type === 'outcome')!;
    expect(decEvt).toBeDefined();
    expect(outEvt).toBeDefined();

    // Verify individual event schemas
    expect(validate('log_event', decEvt).valid).toBe(true);
    expect(validate('log_event', outEvt).valid).toBe(true);

    // Verify pair correspondence
    const pairOk = validatePair(decEvt, outEvt);
    expect(pairOk).toBe(true);
  });
});
