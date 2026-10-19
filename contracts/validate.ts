import Ajv2020 from 'ajv/dist/2020';
import schema from './schema.json';
import type {Snapshot, Decision, LogEvent, ContractKind} from './types';
const validators = Object.fromEntries(['snapshot','decision','log_event'].map(kind => [kind,
  new Ajv2020({strict:true, allErrors:true}).compile({...schema, oneOf:[{$ref:'#/$defs/'+kind}]})]));
function checkTimes(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(checkTimes);
  if (value && typeof value === 'object') return Object.entries(value).every(([k,v]) => {
    if (['decision_time','outcome_time','time','confirmed_at','observed_at','expires_at'].includes(k)) {
      if (typeof v !== 'string' || v.startsWith('0000')) return false;
      const t = new Date(v);
      return Number.isFinite(t.getTime()) && t.toISOString() === v;
    }
    return checkTimes(v);
  });
  return true;
}
export function effectiveC3(snapshot: Snapshot) {
  const risk = snapshot.c3_risk;
  return risk && risk.expires_at > snapshot.decision_time ? risk : null;
}
function snapshotOK(s: Snapshot): boolean {
  return s.recent_results.every(r=>r.outcome_time < s.decision_time)
    && s.hint_history.every(r=>r.time <= s.decision_time)
    && s.confirmed_requests.every(r=>r.confirmed_at <= s.decision_time)
    && (!s.c3_risk || (s.c3_risk.observed_at <= s.decision_time && s.c3_risk.expires_at > s.c3_risk.observed_at))
    && s.teacher_limits.allowed_actions.every(a=>s.teacher_limits.approved_actions.includes(a));
}
function decisionOK(d: Decision): boolean {
  return d.action_id === null ? d.eligible_actions.length === 0 : d.eligible_actions.includes(d.action_id);
}
export function validate(kind: ContractKind, value: unknown): {valid:boolean; c3_status:'known'|'unknown'|null} {
  const invalid = {valid:false,c3_status:null};
  if (!validators[kind] || !validators[kind](value) || !checkTimes(value)) return invalid;
  let snapshot: Snapshot | undefined;
  if (kind === 'snapshot') {
    snapshot = value as Snapshot;
    if (!snapshotOK(snapshot)) return invalid;
  } else if (kind === 'decision') {
    if (!decisionOK(value as Decision)) return invalid;
  } else {
    const e = value as LogEvent;
    if (e.event_type === 'decision') {
      snapshot = e.context_before_action;
      if (!snapshotOK(snapshot) || !decisionOK(e.decision)
        || e.decision_time !== snapshot.decision_time
        || snapshot.recent_results.some(r=>r.decision_id === e.decision_id)
        || snapshot.confirmed_requests.some(r=>r.kind === 'break')
        || e.selected_action !== e.decision.action_id
        || JSON.stringify(e.eligible_actions) !== JSON.stringify(e.decision.eligible_actions)
        || !e.eligible_actions.every(a=>snapshot!.teacher_limits.allowed_actions.includes(a))
        || (e.selected_action === null && e.action_propensity !== null)) return invalid;
    } else if (e.outcome_time <= e.decision_time) return invalid;
  }
  return {valid:true,c3_status:snapshot ? (effectiveC3(snapshot) ? 'known':'unknown') : null};
}
export function validatePair(decision: LogEvent, outcome: LogEvent): boolean {
  if (!validate('log_event',decision).valid || !validate('log_event',outcome).valid
    || decision.event_type !== 'decision' || outcome.event_type !== 'outcome') return false;
  return decision.selected_action !== null && decision.event_id !== outcome.event_id
    && ['decision_id','learner_id','session_id','decision_time','selected_action','source'].every(k=>
      decision[k as keyof typeof decision] === outcome[k as keyof typeof outcome])
    && ['family','profile_id','generator_version','seed'].every(k=>
      decision.simulator_profile[k as keyof typeof decision.simulator_profile] === outcome.simulator_profile[k as keyof typeof outcome.simulator_profile]);
}
