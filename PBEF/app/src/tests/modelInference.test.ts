/**
 * modelInference.test.ts
 * ======================
 * Unit test for modelInference service and verified fused TCN forward engine.
 * Tests:
 *  - 60-float input validation
 *  - Responsive output probability range [0, 1]
 *  - Low baseline risk for active/nominal state (< 0.10)
 *  - Elevated advisory risk on sustained idle state (> 0.30)
 */

import { forwardTcn, runModelInference } from '../services/modelInference';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log('--- Running modelInference Unit Tests ---');

// Test 1: Shape validation
try {
  forwardTcn(new Array(30).fill(0));
  assert(false, 'Expected error on invalid length');
} catch (e: any) {
  assert(e.message.includes('expected 60 floats'), 'Invalid feature length properly rejected');
}

// Test 2: Inference on nominal baseline state
const zeros = new Array(60).fill(0);
const res = forwardTcn(zeros);

assert(Number.isFinite(res.forecastLogit), 'Forecast logit is finite');
assert(res.riskProbability >= 0 && res.riskProbability <= 0.10, `Nominal baseline risk is low (< 10%) (got ${res.riskProbability})`);
assert(res.stateLogits.length === 3, 'State logits length is 3');

// Test 3: Inference on sustained inactivity (inactivity channel elevated)
// Channel 0: perf_counts (idle = -1.89)
// Channel 1: inactivity (idle 20s = +24.4)
const idleTensor = [
  ...new Array(30).fill(-1.89),
  ...Array.from({ length: 30 }, (_, i) => (i - 0.45) / 0.80)
];
const resIdle = forwardTcn(idleTensor);
assert(resIdle.riskProbability >= 0.30, `Sustained idle state elevates risk above 30% advisory threshold (got ${resIdle.riskProbability})`);

// Test 4: Asynchronous runModelInference wrapper
async function testAsync() {
  const asyncRes = await runModelInference(zeros);
  assert(asyncRes.riskProbability > 0 && asyncRes.riskProbability < 1, 'Async inference returns valid probability');
  console.log(`[PASS] Async inference succeeded via backend: ${asyncRes.backend}`);
}

testAsync().then(() => {
  console.log('--- All modelInference Unit Tests Passed! ---');
});
