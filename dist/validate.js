/**
 * Compiled / Standalone Contract Validator for Node.js.
 * Supports Ajv2020 if installed; gracefully falls back to the authoritative
 * Python jsonschema validator if node_modules are not installed.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'contracts/schema.json'), 'utf8'));

let ajvValidators = null;
try {
  const Ajv2020 = require('ajv/dist/2020');
  ajvValidators = Object.fromEntries(
    ['snapshot', 'decision', 'log_event'].map(kind => [
      kind,
      new Ajv2020({ strict: true, allErrors: true }).compile({
        ...schema,
        oneOf: [{ $ref: '#/$defs/' + kind }]
      })
    ])
  );
} catch (e) {
  // Ajv not installed; fallback enabled
  ajvValidators = null;
}

function checkTimes(value) {
  if (Array.isArray(value)) return value.every(checkTimes);
  if (value && typeof value === 'object') {
    return Object.entries(value).every(([k, v]) => {
      if (['decision_time', 'outcome_time', 'time', 'confirmed_at', 'observed_at', 'expires_at'].includes(k)) {
        if (typeof v !== 'string' || v.startsWith('0000')) return false;
        const t = new Date(v);
        return Number.isFinite(t.getTime()) && t.toISOString() === v;
      }
      return checkTimes(v);
    });
  }
  return true;
}

function effectiveC3(snapshot) {
  const risk = snapshot ? snapshot.c3_risk : null;
  return risk && risk.expires_at > snapshot.decision_time ? risk : null;
}

function snapshotOK(s) {
  return (
    s.recent_results.every(r => r.outcome_time < s.decision_time) &&
    s.hint_history.every(r => r.time <= s.decision_time) &&
    s.confirmed_requests.every(r => r.confirmed_at <= s.decision_time) &&
    (!s.c3_risk || (s.c3_risk.observed_at <= s.decision_time && s.c3_risk.expires_at > s.c3_risk.observed_at)) &&
    s.teacher_limits.allowed_actions.every(a => s.teacher_limits.approved_actions.includes(a))
  );
}

function decisionOK(d) {
  return d.action_id === null ? d.eligible_actions.length === 0 : d.eligible_actions.includes(d.action_id);
}

function validatePythonFallback(kind, value) {
  const pythonBin = fs.existsSync(path.join(root, '.venv/bin/python'))
    ? path.join(root, '.venv/bin/python')
    : 'python3';
  const script = `
import json, sys
from contracts.validate import validate
res = validate(sys.argv[1], json.loads(sys.argv[2]))
print(json.dumps(res))
`;
  try {
    const out = execFileSync(pythonBin, ['-c', script, kind, JSON.stringify(value)], {
      cwd: root,
      encoding: 'utf8'
    });
    return JSON.parse(out.trim());
  } catch (err) {
    return { valid: false, c3_status: null };
  }
}

function validate(kind, value) {
  const invalid = { valid: false, c3_status: null };
  if (!checkTimes(value)) return invalid;

  if (ajvValidators && ajvValidators[kind]) {
    if (!ajvValidators[kind](value)) return invalid;
    let snapshot;
    if (kind === 'snapshot') {
      snapshot = value;
      if (!snapshotOK(snapshot)) return invalid;
    } else if (kind === 'decision') {
      if (!decisionOK(value)) return invalid;
    } else {
      const e = value;
      if (e.event_type === 'decision') {
        snapshot = e.context_before_action;
        if (
          !snapshotOK(snapshot) ||
          !decisionOK(e.decision) ||
          e.decision_time !== snapshot.decision_time ||
          snapshot.recent_results.some(r => r.decision_id === e.decision_id) ||
          snapshot.confirmed_requests.some(r => r.kind === 'break') ||
          e.selected_action !== e.decision.action_id ||
          JSON.stringify(e.eligible_actions) !== JSON.stringify(e.decision.eligible_actions) ||
          !e.eligible_actions.every(a => snapshot.teacher_limits.allowed_actions.includes(a)) ||
          (e.selected_action === null && e.action_propensity !== null)
        )
          return invalid;
      } else if (e.outcome_time <= e.decision_time) return invalid;
    }
    return { valid: true, c3_status: snapshot ? (effectiveC3(snapshot) ? 'known' : 'unknown') : null };
  }

  // Graceful fallback to Python jsonschema validator
  return validatePythonFallback(kind, value);
}

function validatePair(decision, outcome) {
  if (
    !validate('log_event', decision).valid ||
    !validate('log_event', outcome).valid ||
    decision.event_type !== 'decision' ||
    outcome.event_type !== 'outcome'
  )
    return false;
  return (
    decision.selected_action !== null &&
    decision.event_id !== outcome.event_id &&
    ['decision_id', 'learner_id', 'session_id', 'decision_time', 'selected_action', 'source'].every(
      k => decision[k] === outcome[k]
    ) &&
    ['family', 'profile_id', 'generator_version', 'seed'].every(
      k => decision.simulator_profile[k] === outcome.simulator_profile[k]
    )
  );
}

module.exports = {
  validate,
  validatePair,
  effectiveC3
};
