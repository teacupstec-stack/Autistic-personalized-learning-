/**
 * eventMapping.test.ts
 * ====================
 * Unit tests for mapping InteractionEvent to SessionEvent without duplication.
 */

import { toSessionEvent, toSessionEvents } from '../services/eventMapping';
import { InteractionEvent } from '../event_logger';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log('--- Running eventMapping Unit Tests ---');

const rawEvents: InteractionEvent[] = [
  {
    learner_id: 'L001',
    session_id: 'S1',
    time_ms: 1250,
    event_type: 'stimulus_presented',
    activity_id: 'math_q1',
    prompt_count: 0,
    metadata: { stimulus_id: 'q1' },
  },
  {
    learner_id: 'L001',
    session_id: 'S1',
    time_ms: 3200,
    event_type: 'answer_selected',
    activity_id: 'math_q1',
    prompt_count: 0,
    metadata: { question_id: 'q1', selected_option_id: 'opt_c' },
  },
  {
    learner_id: 'L001',
    session_id: 'S1',
    time_ms: 4500,
    event_type: 'response',
    activity_id: 'math_q1',
    response_latency_ms: 3250,
    prompt_count: 0,
    accuracy: 1,
    metadata: { question_id: 'q1', selected_option: '32', correct_answer: 32 },
  },
  {
    learner_id: 'L001',
    session_id: 'S1',
    time_ms: 8000,
    event_type: 'idle_pause',
    activity_id: 'math_q1',
    prompt_count: 0,
    pause_before_action_ms: 2500,
    metadata: { pause_action: 'resume', pause_duration_ms: 2500 },
  },
];

const mapped = toSessionEvents(rawEvents);

assert(mapped.length === 4, 'All 4 interaction events are mapped');
assert(mapped[0].type === 'stimulus_presented', 'stimulus_presented mapped correctly');
assert(mapped[0].timestamp_sec === 1.25, '1250ms mapped to 1.25s');

assert(mapped[1].type === 'answer_selected', 'answer_selected mapped correctly');
assert(mapped[1].metadata?.selected_option_id === 'opt_c', 'Selected option preserved');

assert(mapped[2].type === 'answer_submitted', 'response mapped to canonical answer_submitted');
assert(mapped[2].metadata?.latencyMs === 3250, 'Latency in metadata');
assert(mapped[2].metadata?.isCorrect === true, 'isCorrect in metadata (not duplicate event)');

assert(mapped[3].type === 'idle_pause', 'idle_pause preserved');
assert(mapped[3].metadata?.pauseBeforeActionMs === 2500, 'Pause duration preserved in metadata');

console.log('--- All eventMapping Unit Tests Passed! ---');
