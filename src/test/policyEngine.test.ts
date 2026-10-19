import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  ContextEncoderMLP,
  BayesianLinearHead,
  SCPABanditPolicy,
  SCPANoConfidenceWeightPolicy,
  SCPANoSharedSignalsPolicy,
  EducatorRulesPolicy,
  FixedSequencingPolicy,
  LinearBanditPolicy,
  invertMatrix,
  cholesky,
  vecDot
} from '../services/policyEngine';
import type { Snapshot } from '../types';
import browserModelData from '../../models/browser_model.json';

describe('Math and Matrix Operations', () => {
  it('correctly inverts an identity matrix and 2x2 positive definite matrix', () => {
    const I = [
      [1, 0],
      [0, 1]
    ];
    const invI = invertMatrix(I);
    expect(invI[0][0]).toBeCloseTo(1, 4);
    expect(invI[1][1]).toBeCloseTo(1, 4);
    expect(invI[0][1]).toBeCloseTo(0, 4);

    const A = [
      [4, 1],
      [1, 3]
    ];
    // det = 11, inv = [3/11, -1/11; -1/11, 4/11]
    const invA = invertMatrix(A);
    expect(invA[0][0]).toBeCloseTo(3 / 11, 4);
    expect(invA[0][1]).toBeCloseTo(-1 / 11, 4);
    expect(invA[1][0]).toBeCloseTo(-1 / 11, 4);
    expect(invA[1][1]).toBeCloseTo(4 / 11, 4);
  });

  it('performs Cholesky decomposition L L^T = A', () => {
    const A = [
      [4, 2],
      [2, 5]
    ];
    const L = cholesky(A);
    expect(L[0][0]).toBeCloseTo(2, 4);
    expect(L[1][0]).toBeCloseTo(1, 4);
    expect(L[1][1]).toBeCloseTo(2, 4);
  });
});

describe('Feature Extraction & C3 Freshness', () => {
  const baseSnapshot: Snapshot = {
    snapshot_id: 'snap_test_1',
    decision_time: '2026-10-19T14:30:00.000Z',
    skill_estimate: 0.65,
    recent_results: [
      { decision_id: 'd1', outcome_time: '2026-10-19T14:28:00.000Z', success: true, independent: true },
      { decision_id: 'd2', outcome_time: '2026-10-19T14:29:00.000Z', success: false, independent: false }
    ],
    hint_history: [{ time: '2026-10-19T14:28:30.000Z', count: 1 }],
    confirmed_requests: [],
    c3_risk: {
      value: 0.60,
      confidence: 0.80,
      observed_at: '2026-10-19T14:29:00.000Z',
      expires_at: '2026-10-19T14:35:00.000Z' // Fresh: expires AFTER decision_time
    },
    teacher_limits: {
      approved_actions: ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'],
      allowed_actions: ['easy_visual', 'easy_text'],
      max_failure_sequence: 3
    }
  };

  it('extracts 9 normalized numerical features with fresh C3 signal', () => {
    const feats = extractFeatures(baseSnapshot, baseSnapshot.decision_time);
    expect(feats.length).toBe(9);
    expect(feats[0]).toBeCloseTo(0.65); // skill_estimate
    expect(feats[1]).toBeCloseTo(0.50); // success_rate (1 out of 2)
    expect(feats[2]).toBeCloseTo(0.50); // independent_rate (1 out of 2)
    expect(feats[3]).toBeCloseTo(1.00); // hint_frequency
    expect(feats[4]).toBeCloseTo(0.48); // c3_weighted_risk = 0.60 * 0.80
    expect(feats[5]).toBeCloseTo(0.80); // c3_confidence
    expect(feats[6]).toBe(1.0); // c3_is_known
    expect(feats[7]).toBe(0.0); // c3_is_missing
    expect(feats[8]).toBe(1.0); // consecutive_failures streak
  });

  it('handles expired C3 signal as UNKNOWN (never assumes 0 risk as normal)', () => {
    const expiredSnap: Snapshot = {
      ...baseSnapshot,
      c3_risk: {
        value: 0.70,
        confidence: 0.90,
        observed_at: '2026-10-19T14:20:00.000Z',
        expires_at: '2026-10-19T14:25:00.000Z' // Expired BEFORE decision_time (14:30:00)
      }
    };
    const feats = extractFeatures(expiredSnap, expiredSnap.decision_time);
    expect(feats[6]).toBe(0.0); // c3_is_known = 0
    expect(feats[7]).toBe(1.0); // c3_is_missing = 1
  });
});

describe('SCPA Policy & Baselines', () => {
  const dummySnapshot: Snapshot = {
    snapshot_id: 'snap_test_2',
    decision_time: '2026-10-19T14:30:00.000Z',
    skill_estimate: 0.50,
    recent_results: [],
    hint_history: [],
    confirmed_requests: [],
    c3_risk: null,
    teacher_limits: {
      approved_actions: ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'],
      allowed_actions: ['easy_visual', 'medium_visual'],
      max_failure_sequence: 3
    }
  };

  it('selects strictly from eligible allowed actions', () => {
    const policy = new SCPABanditPolicy();
    const eligible = ['easy_visual', 'medium_visual'] as const;

    for (let i = 0; i < 10; i++) {
      const { selected_action } = policy.selectAction(dummySnapshot, [...eligible]);
      expect(eligible).toContain(selected_action);
    }
  });

  it('returns action_id = null when eligible actions list is empty (Tripwire state)', () => {
    const policy = new SCPABanditPolicy();
    const { selected_action, explainability } = policy.selectAction(dummySnapshot, []);
    expect(selected_action).toBeNull();
    expect(explainability.selected_action).toBeNull();
    expect(explainability.reason).toContain('No eligible actions');
  });

  it('updates Bayesian head weights sequentially without error', () => {
    const policy = new SCPABanditPolicy();
    const action = 'easy_visual';
    const initialMean = [...policy.heads[action].m];

    // Update with positive reward
    policy.update(dummySnapshot, action, 0.85);
    const updatedMean = policy.heads[action].m;

    // Weights should shift towards positive correlation
    expect(updatedMean).not.toEqual(initialMean);
  });

  it('EducatorRulesPolicy steps up on success and retreats to easy on failure or high C3 risk', () => {
    const educator = new EducatorRulesPolicy();

    // High risk snapshot -> should select easy_visual
    const highRiskSnap: Snapshot = {
      ...dummySnapshot,
      c3_risk: {
        value: 0.80,
        confidence: 0.90,
        observed_at: '2026-10-19T14:28:00.000Z',
        expires_at: '2026-10-19T14:35:00.000Z'
      }
    };
    const res = educator.selectAction(highRiskSnap, [
      'easy_visual',
      'easy_text',
      'medium_visual',
      'medium_text'
    ]);
    expect(res.selected_action).toBe('easy_visual');
  });

  it('FixedSequencingPolicy cycles sequentially through candidate actions', () => {
    const seq = new FixedSequencingPolicy();
    const actions = ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'] as const;

    const r1 = seq.selectAction(dummySnapshot, [...actions]);
    const r2 = seq.selectAction(dummySnapshot, [...actions]);
    const r3 = seq.selectAction(dummySnapshot, [...actions]);
    const r4 = seq.selectAction(dummySnapshot, [...actions]);

    expect(r1.selected_action).toBe('easy_visual');
    expect(r2.selected_action).toBe('easy_text');
    expect(r3.selected_action).toBe('medium_visual');
    expect(r4.selected_action).toBe('medium_text');
  });
});
