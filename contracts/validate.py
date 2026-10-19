"""Shared-schema structural validation plus explicit cross-field invariants.
No coercion, imputation, mutation, or wall-clock reads. Simulated data only.
"""
import json
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError

SCHEMA = json.loads(Path(__file__).with_name('schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATORS = {k: Draft202012Validator({**SCHEMA, 'oneOf': [{'$ref': '#/$defs/'+k}]})
              for k in ('snapshot', 'decision', 'log_event')}

def timestamp(value):
    dt = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
    if dt.year == 0:
        raise ValueError('invalid year')
    return dt

def check_times(value):
    if isinstance(value, dict):
        for key, val in value.items():
            if key in ('decision_time', 'outcome_time', 'time', 'confirmed_at', 'observed_at', 'expires_at'):
                timestamp(val)
            else:
                check_times(val)
    elif isinstance(value, list):
        for val in value:
            check_times(val)

def effective_c3(snapshot):
    """Call only after validation. Expiry is relative to decision time."""
    risk = snapshot.get('c3_risk')
    return risk if risk and risk['expires_at'] > snapshot['decision_time'] else None

def semantic(kind, value):
    check_times(value)
    if kind == 'snapshot':
        now = value['decision_time']
        if any(x['outcome_time'] >= now for x in value['recent_results']):
            raise ValueError('history must precede decision')
        if any(x['time'] > now for x in value['hint_history']):
            raise ValueError('future hint')
        if any(x['confirmed_at'] > now for x in value['confirmed_requests']):
            raise ValueError('future request')
        risk = value.get('c3_risk')
        if risk and (risk['observed_at'] > now or risk['expires_at'] <= risk['observed_at']):
            raise ValueError('invalid signal interval')
        limits = value['teacher_limits']
        if not set(limits['allowed_actions']) <= set(limits['approved_actions']):
            raise ValueError('unapproved allowed action')
    elif kind == 'decision':
        action, eligible = value['action_id'], value['eligible_actions']
        if (action is None) != (len(eligible) == 0) or (action is not None and action not in eligible):
            raise ValueError('selection outside eligibility')
    elif value['event_type'] == 'decision':
        s, d = value['context_before_action'], value['decision']
        semantic('snapshot', s)
        semantic('decision', d)
        if value['decision_time'] != s['decision_time']:
            raise ValueError('snapshot time mismatch')
        if any(x['decision_id'] == value['decision_id'] for x in s['recent_results']):
            raise ValueError('current outcome leaked into history')
        if any(x['kind'] == 'break' for x in s['confirmed_requests']):
            raise ValueError('break bypasses C2: no decision event')
        if value['selected_action'] != d['action_id'] or value['eligible_actions'] != d['eligible_actions']:
            raise ValueError('decision fields disagree')
        if not set(d['eligible_actions']) <= set(s['teacher_limits']['allowed_actions']):
            raise ValueError('eligible action outside teacher limits')
        if d['action_id'] is None and value['action_propensity'] is not None:
            raise ValueError('no selection has no propensity')
    elif value['outcome_time'] <= value['decision_time']:
        raise ValueError('outcome must follow decision')

def validate(kind, value):
    if kind not in VALIDATORS:
        return {'valid': False, 'c3_status': None}
    try:
        VALIDATORS[kind].validate(value)
        semantic(kind, value)
    except (ValueError, TypeError, KeyError, ValidationError):
        # ValidationError and calendar errors are intentionally rejection, never coercion.
        return {'valid': False, 'c3_status': None}
    snapshot = value if kind == 'snapshot' else value.get('context_before_action')
    return {'valid': True, 'c3_status': ('known' if effective_c3(snapshot) is not None else 'unknown') if snapshot else None}

def validate_pair(decision, outcome):
    """Stream-level check: an outcome must refer to an actual selected action."""
    if not validate('log_event', decision)['valid'] or not validate('log_event', outcome)['valid']:
        return False
    if decision['event_type'] != 'decision' or outcome['event_type'] != 'outcome':
        return False
    fields = ('decision_id', 'learner_id', 'session_id', 'decision_time', 'selected_action', 'source', 'simulator_profile')
    return decision['selected_action'] is not None and all(decision[k] == outcome[k] for k in fields) and decision['event_id'] != outcome['event_id']
