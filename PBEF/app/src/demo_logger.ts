/**
 * @file demo_logger.ts
 * @description Standalone runnable execution script demonstrating SessionEventLogger.
 * Runs a simulated learning session, logs monotonic interaction events, and exports
 * conforming JSONL and CSV logs.
 *
 * TO RUN:
 *   npx tsx src/demo_logger.ts
 *   OR from app/ directory: npm run demo-logger
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionEventLogger, InteractionEvent } from './event_logger';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoggerDemo() {
  console.log('===============================================================');
  console.log('  Component 3 (PBEF) — Client-Side Event Logger Demonstration  ');
  console.log('===============================================================\n');

  const learnerId = 'L001';
  const sessionId = 'S_DEMO_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const activityId = 'matching_shapes_01';

  console.log(`[Config] Learner ID:  ${learnerId}`);
  console.log(`[Config] Session ID:  ${sessionId}`);
  console.log(`[Config] Activity ID: ${activityId}\n`);

  // 1. Initialize Logger with onFlush callback
  const logger = new SessionEventLogger({
    learner_id: learnerId,
    session_id: sessionId,
    activity_id: activityId,
    flushIntervalMs: 5000,
    onFlush: (events: InteractionEvent[]) => {
      console.log(`[Flush] Auto-flushed buffer: ${events.length} events logged so far.`);
    },
  });

  // 2. Start Session
  console.log('--> Starting session...');
  const startEvent = logger.startSession();
  console.log(`[Event: ${startEvent.event_type}] Monotonic offset: ${startEvent.time_ms}ms`);

  await sleep(150);

  // 3. Trial 1: Stimulus -> Touch -> Fast Correct Response
  console.log('\n--- Trial 1: Active prompt & response ---');
  const stim1 = logger.logStimulusPresented('stim_triangle_01');
  console.log(`[Event: ${stim1.event_type}] Stimulus shown @ ${stim1.time_ms}ms (stim_triangle_01)`);

  await sleep(200);
  const touchDown1 = logger.logTouch('touch_down', 0.42, 0.65);
  console.log(`[Event: ${touchDown1.event_type}] Screen touched @ (${touchDown1.touch_x}, ${touchDown1.touch_y})`);

  await sleep(80);
  const touchUp1 = logger.logTouch('touch_up', 0.42, 0.65);
  console.log(`[Event: ${touchUp1.event_type}] Finger released @ ${touchUp1.time_ms}ms`);

  const resp1 = logger.logResponse({ isCorrect: true, touchX: 0.42, touchY: 0.65 });
  console.log(`[Event: ${resp1.event_type}] Correct response! Latency: ${resp1.response_latency_ms}ms`);

  await sleep(200);

  // 4. Trial 2: Stimulus -> Hesitation -> Hint Requested -> Hint Delivered -> Response
  console.log('\n--- Trial 2: Hesitation with educator hint ---');
  logger.logStimulusPresented('stim_star_02');
  await sleep(150);

  // Log optional visual frame (camera shows head pose)
  const vis = logger.logVisualFrame({
    face_present: true,
    is_valid: true,
    head_pose_yaw: -3.5,
    head_pose_pitch: 1.2,
  });
  console.log(`[Event: ${vis.event_type}] Visual frame: yaw=${vis.visual_features?.head_pose_yaw}°, pitch=${vis.visual_features?.head_pose_pitch}°, valid=true`);

  await sleep(100);
  const hintReq = logger.logPrompt('hint_requested', 'audio_scaffold');
  console.log(`[Event: ${hintReq.event_type}] Learner clicked hint button @ ${hintReq.time_ms}ms`);

  await sleep(100);
  const hintDel = logger.logPrompt('hint_delivered', 'visual_glow');
  console.log(`[Event: ${hintDel.event_type}] Scaffold displayed. Current prompt count: ${hintDel.prompt_count}`);

  await sleep(120);
  const resp2 = logger.logResponse({ isCorrect: true, touchX: 0.78, touchY: 0.31 });
  console.log(`[Event: ${resp2.event_type}] Response after prompt! Latency: ${resp2.response_latency_ms}ms`);

  await sleep(250);

  // 5. Activity Transition
  console.log('\n--- Transitioning to new activity ---');
  const act2 = logger.setActivity('sorting_colors_02');
  console.log(`[Event: ${act2.event_type}] Activity changed to: ${act2.activity_id} @ ${act2.time_ms}ms`);

  await sleep(150);

  // 6. Conclude Session
  console.log('\n--> Concluding session...');
  const endEvent = logger.endSession();
  console.log(`[Event: ${endEvent.event_type}] Session ended @ ${endEvent.time_ms}ms total elapsed.`);

  // 7. Serialize & Inspect Outputs
  const allEvents = logger.getEvents();
  console.log(`\n================ Summary ================`);
  console.log(`Total events recorded: ${allEvents.length}`);

  const jsonlOutput = logger.toJsonLines();
  const csvOutput = logger.toCsv();

  // Save outputs to data/synthetic
  const outputDir = path.resolve(__dirname, '../../data/synthetic');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonlPath = path.join(outputDir, `demo_events_${sessionId}.jsonl`);
  const csvPath = path.join(outputDir, `demo_events_${sessionId}.csv`);

  fs.writeFileSync(jsonlPath, jsonlOutput, 'utf-8');
  fs.writeFileSync(csvPath, csvOutput, 'utf-8');

  console.log(`Saved JSONL to: ${jsonlPath}`);
  console.log(`Saved CSV to:   ${csvPath}`);
  console.log('\nSample JSONL line conforming to docs/DATA_CONTRACT.md:');
  console.log(jsonlOutput.split('\n')[2]);
  console.log('\n[Success] Event logger demonstration completed successfully!');
}

runLoggerDemo().catch((err) => {
  console.error('[Error] Demo failed:', err);
  process.exit(1);
});
