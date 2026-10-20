/**
 * alertEngine.test.ts
 * ===================
 * Unit tests for Alert State Machine and Cooldown Protocol.
 */

import {
  createInitialAlertState,
  updateAlertState,
  acknowledgeAlert,
  dismissAlert,
  AlertConfig,
} from '../services/alertEngine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log('--- Running alertEngine Unit Tests ---');

const config: AlertConfig = {
  threshold: 0.30,
  consecutivePredictions: 3,
  cooldownSec: 30,
};

let state = createInitialAlertState();
assert(state.status === 'monitoring', 'Initial state is monitoring');
assert(state.consecutiveHighRisk === 0, 'Initial consecutive count is 0');

// Step 1: Normal risk (0.10)
state = updateAlertState(state, 0.10, 10, true, config);
assert(state.status === 'monitoring', 'Normal risk remains monitoring');
assert(state.consecutiveHighRisk === 0, 'Consecutive count remains 0 on normal risk');

// Step 2: First high risk (0.42) -> elevated_risk (NOT yet advisory_active)
state = updateAlertState(state, 0.42, 11, true, config);
assert(state.status === 'elevated_risk', 'Single high risk transitions to elevated_risk');
assert(state.consecutiveHighRisk === 1, 'Consecutive count is 1');

// Step 3: Second high risk (0.45) -> still elevated_risk
state = updateAlertState(state, 0.45, 12, true, config);
assert(state.status === 'elevated_risk', 'Second high risk remains elevated_risk');
assert(state.consecutiveHighRisk === 2, 'Consecutive count is 2');

// Step 4: Third high risk (0.50) -> advisory_active (Alert Rule Satisfied)
state = updateAlertState(state, 0.50, 13, true, config);
assert(state.status === 'advisory_active', 'Third consecutive high risk activates advisory_active');
assert(state.lastAlertAt === 13, 'Alert timestamp recorded at t=13s');

// Step 5: In cooldown period (t=20s < 13 + 30 = 43s) -> cooldown
state = updateAlertState(state, 0.60, 20, true, config);
assert(state.status === 'cooldown', 'During cooldown, alerts are suppressed (status=cooldown)');

// Step 6: After cooldown expires (t=45s >= 43s) -> drops back to single elevated_risk
state = updateAlertState(state, 0.40, 45, true, config);
assert(state.status === 'elevated_risk', 'After cooldown expires, single high risk becomes elevated_risk');

// Step 7: Invalid probability -> insufficient_data
const invalidState = updateAlertState(state, null, 50, false, config);
assert(invalidState.status === 'insufficient_data', 'Invalid probability yields insufficient_data');

// Step 8: Dismiss alert transitions to cooldown
let testDismissState = updateAlertState(createInitialAlertState(), 0.5, 100, true, config);
testDismissState = updateAlertState(testDismissState, 0.5, 101, true, config);
testDismissState = updateAlertState(testDismissState, 0.5, 102, true, config);
assert(testDismissState.status === 'advisory_active', 'Reaches advisory_active');

const dismissed = dismissAlert(testDismissState, 102);
assert(dismissed.status === 'cooldown', 'Dismissing alert puts state in cooldown');

console.log('--- All alertEngine Unit Tests Passed! ---');
