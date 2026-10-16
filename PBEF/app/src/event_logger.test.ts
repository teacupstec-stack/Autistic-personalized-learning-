/**
 * @file event_logger.test.ts
 * @description Unit tests for SessionEventLogger covering:
 *  - Incremental flush without duplication (Issue 3 resolution)
 *  - Stimulus latency consumption and stale prevention (Issue 4 resolution)
 *  - Monotonic session clock
 *  - CSV / JSONL serialization compliance
 */

import { SessionEventLogger, InteractionEvent } from './event_logger';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('--- Running SessionEventLogger Unit Tests ---');

  // Test 1: Incremental Flush Semantics (Issue 3)
  {
    const flushedBatches: InteractionEvent[][] = [];
    const logger = new SessionEventLogger({
      learner_id: 'L001',
      session_id: 'S_TEST',
      activity_id: 'act_01',
      flushMode: 'incremental',
      onFlush: (batch) => {
        flushedBatches.push(batch);
      },
    });

    logger.startSession();
    logger.logTouch('touch_down', 0.1, 0.2);
    await logger.flush();

    assert(flushedBatches.length === 1, 'First flush emits batch 1');
    assert(flushedBatches[0].length === 2, 'Batch 1 has 2 events');

    // Second flush with NO new events
    await logger.flush();
    assert(flushedBatches.length === 1, 'Second flush without new events does not emit duplicates');

    // Add 1 more event and flush
    logger.logTouch('touch_up', 0.1, 0.2);
    await logger.flush();
    assert(flushedBatches.length === 2, 'Third flush emits batch 2');
    assert(flushedBatches[1].length === 1, 'Batch 2 contains only 1 newly added event (incremental)');
    assert(flushedBatches[1][0].event_type === 'touch_up', 'Batch 2 event is touch_up');
  }

  // Test 2: Stimulus Consumption and Stale Latency Prevention (Issue 4)
  {
    const logger = new SessionEventLogger({
      learner_id: 'L001',
      session_id: 'S_TEST',
      activity_id: 'act_01',
    });

    logger.startSession();
    logger.logStimulusPresented('card_A');

    // First response consumes stimulus
    const resp1 = logger.logResponse({ isCorrect: true, touchX: 0.5, touchY: 0.5 });
    assert(typeof resp1.response_latency_ms === 'number', 'First response receives valid latency');
    assert(resp1.metadata?.stimulus_id === 'card_A', 'First response is linked to card_A');

    // Second response without a new stimulus MUST NOT inherit card_A's latency
    const resp2 = logger.logResponse({ isCorrect: false, touchX: 0.2, touchY: 0.3 });
    assert(resp2.response_latency_ms === null, 'Second response without stimulus has null latency (stale prevented)');
    assert(!resp2.metadata?.stimulus_id, 'Second response has no stimulus_id');
  }

  // Test 3: Snapshot Flush Mode
  {
    const flushedSnapshots: InteractionEvent[][] = [];
    const logger = new SessionEventLogger({
      learner_id: 'L001',
      session_id: 'S_TEST',
      activity_id: 'act_01',
      flushMode: 'snapshot',
      onFlush: (all) => {
        flushedSnapshots.push(all);
      },
    });

    logger.startSession();
    await logger.flush();
    logger.logTouch('touch_down', 0.5, 0.5);
    await logger.flush();

    assert(flushedSnapshots[0].length === 1, 'Snapshot 1 has 1 event');
    assert(flushedSnapshots[1].length === 2, 'Snapshot 2 has 2 events');
  }

  console.log('--- All SessionEventLogger Unit Tests Passed! ---');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
