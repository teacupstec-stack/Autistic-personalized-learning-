/**
 * eventFeatureAdapter.test.ts
 * ===========================
 * Unit tests for causal window extraction, personal baseline normalization,
 * exact [2, 30] tensor shape, and zero-leakage constraints.
 */

import { extractCausalWindow, calculatePersonalBaseline } from '../services/eventFeatureAdapter';
import { SessionEvent } from '../types/participation';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log('--- Running eventFeatureAdapter Unit Tests ---');

const dummyEvents: SessionEvent[] = [
  { event_id: 'e1', session_id: 'S1', timestamp_sec: 5, type: 'task_started' },
  { event_id: 'e2', session_id: 'S1', timestamp_sec: 15, type: 'answer_submitted', metadata: { latencyMs: 1100, isCorrect: true } },
  { event_id: 'e3', session_id: 'S1', timestamp_sec: 40, type: 'answer_submitted', metadata: { latencyMs: 1300, isCorrect: false } },
  { event_id: 'e4', session_id: 'S1', timestamp_sec: 50, type: 'answer_submitted', metadata: { latencyMs: 1200, isCorrect: true } },
  { event_id: 'e5', session_id: 'S1', timestamp_sec: 58, type: 'touch' },
  // Future event: should NEVER leak into window at t=60
  { event_id: 'e6', session_id: 'S1', timestamp_sec: 65, type: 'answer_submitted', metadata: { latencyMs: 5000, isCorrect: true } },
];

// Test 1: Window before historySec (t=20 < 30) -> data_valid must be false
const earlyWindow = extractCausalWindow(dummyEvents, 20, 30);
assert(!earlyWindow.dataValid, 't < 30s yields dataValid: false');
assert(!earlyWindow.snapshot.data_valid, 'Snapshot data_valid is false for t < 30s');

// Test 2: Valid causal window at t=60s (window covers [30s, 60s])
const validWindow = extractCausalWindow(dummyEvents, 60, 30);
assert(validWindow.dataValid, 't=60s yields dataValid: true');
assert(validWindow.binnedPerfCounts.length === 30, 'Extracted Channel 0 (perf_counts) length is exactly 30 bins');
assert(validWindow.binnedInactivity.length === 30, 'Extracted Channel 1 (inactivity) length is exactly 30 bins');
assert(validWindow.normalizedFeatures.length === 60, 'Normalized tensor is exactly 60 floats [1, 2, 30]');

// Test 3: Zero Future Leakage (Event at t=65s must NOT be included in latency or attempts at t=60s)
assert(validWindow.snapshot.answer_attempts_30s === 2, 'Exactly 2 answers in [30s, 60s] (e3 and e4)');
assert(validWindow.snapshot.correct_answers_30s === 1, 'Exactly 1 correct answer (e4)');
assert(validWindow.snapshot.mean_response_latency_ms === 1250, 'Mean latency is (1300 + 1200) / 2 = 1250 ms');
assert(validWindow.snapshot.inactivity_sec === 2.0, 'Inactivity is 60 - 58 = 2.0s');

// Test 4: Calibration Baseline Extraction
const baseline = calculatePersonalBaseline(dummyEvents, 60);
assert(baseline.isCalibrated, 'Baseline is marked as calibrated');
assert(baseline.sampleCount === 60, 'Sample count is 60 seconds');
assert(baseline.perfCountMean > 0, 'Perf count mean is positive');
assert(baseline.perfCountStd > 0, 'Perf count std is positive');

console.log('--- All eventFeatureAdapter Unit Tests Passed! ---');
