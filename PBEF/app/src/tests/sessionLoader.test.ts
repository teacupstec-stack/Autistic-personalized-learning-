/**
 * sessionLoader.test.ts
 * =====================
 * Unit tests for Session Ingestion and Validation Service.
 */

import { parseSessionEvents } from '../services/sessionLoader';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log('--- Running sessionLoader Unit Tests ---');

// Test 1: Valid JSONL parsing with chronological sorting
const jsonlData = `
{"event_id":"e002","session_id":"S_TEST","timestamp_sec":12,"type":"answer_submitted","metadata":{"latencyMs":1200}}
{"event_id":"e001","session_id":"S_TEST","timestamp_sec":4,"type":"task_started"}
{"event_id":"e003","session_id":"S_TEST","timestamp_sec":18,"type":"answer_correct","metadata":{"latencyMs":1150}}
`;

const loadedJsonl = parseSessionEvents(jsonlData, 'demo_session.jsonl');
assert(loadedJsonl.sessionId === 'S_TEST', 'Parsed session ID correctly from JSONL');
assert(loadedJsonl.events.length === 3, 'Parsed 3 events');
assert(loadedJsonl.events[0].event_id === 'e001', 'Events sorted chronologically (e001 at t=4s is first)');
assert(loadedJsonl.events[1].event_id === 'e002', 'e002 at t=12s is second');
assert(loadedJsonl.events[2].event_id === 'e003', 'e003 at t=18s is third');
assert(loadedJsonl.inputMode === 'simulated_session', 'demo_session.jsonl recognized as simulated_session');

// Test 2: Valid CSV parsing
const csvData = `
session_id,timestamp_sec,type
S_CSV,5,task_started
S_CSV,15,answer_submitted
S_CSV,25,touch
`;

const loadedCsv = parseSessionEvents(csvData, 'clinical_S_CSV.csv');
assert(loadedCsv.sessionId === 'S_CSV', 'Parsed session ID correctly from CSV');
assert(loadedCsv.events.length === 3, 'Parsed 3 CSV rows');
assert(loadedCsv.events[0].timestamp_sec === 5, 'CSV first timestamp is 5s');
assert(loadedCsv.inputMode === 'recorded_session', 'clinical_S_CSV.csv recognized as recorded_session');

// Test 3: Reject empty file
try {
  parseSessionEvents('', 'empty.jsonl');
  assert(false, 'Should have thrown error on empty file');
} catch (e: any) {
  assert(e.message.includes('empty'), 'Empty file rejected with clear error');
}

console.log('--- All sessionLoader Unit Tests Passed! ---');
