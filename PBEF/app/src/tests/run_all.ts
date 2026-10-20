/**
 * run_all.ts
 * ==========
 * Master test runner for PBEF Component 3 client-side unit test suite.
 */

import '../event_logger.test';
import './alertEngine.test';
import './eventFeatureAdapter.test';
import './eventMapping.test';
import './modelInference.test';
import './sessionLoader.test';

console.log('\n========================================');
console.log('ALL CLIENT-SIDE UNIT TEST SUITES PASSED!');
console.log('========================================\n');
