const assert = require('node:assert/strict');
const {validate,validatePair} = require('../dist/validate.js');
const fixtures = require('./fixtures.json');
const pairs = require('./pairs.json');
const results = fixtures.map(f=>{
  const before=JSON.stringify(f.value);
  const result=validate(f.kind,f.value);
  assert.deepEqual(result,f.expected,f.name);
  assert.equal(JSON.stringify(f.value),before,'validation mutated '+f.name);
  return result;
});
const pairResults=pairs.map(p=>{
  const result=validatePair(p.decision,p.outcome);
  assert.equal(result,p.expected,p.name);
  return result;
});
if (process.argv.includes('--json')) console.log(JSON.stringify({results,pairResults}));
else console.log(`TypeScript: ${fixtures.length} fixtures + ${pairs.length} event pairs passed (simulated).`);
