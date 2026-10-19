import browserModelData from '../../models/browser_model.json';
import preprocessingData from '../../models/preprocessing.json';
import type { Snapshot, ActionVariant, ExplainabilityData, PolicyType } from '../types';

export const CANONICAL_ACTIONS: ActionVariant[] = [
  'easy_visual',
  'easy_text',
  'medium_visual',
  'medium_text'
];

export const ACTION_MAP: Record<ActionVariant, number> = {
  easy_visual: 0,
  easy_text: 1,
  medium_visual: 2,
  medium_text: 3
};

// --- Pure Vector and Matrix Helpers ---

export function vecDot(u: number[], v: number[]): number {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i] * v[i];
  }
  return sum;
}

export function vecAdd(u: number[], v: number[]): number[] {
  return u.map((val, i) => val + v[i]);
}

export function matVecMul(M: number[][], v: number[]): number[] {
  return M.map(row => vecDot(row, v));
}

export function outerProduct(u: number[], v: number[]): number[][] {
  return u.map(a => v.map(b => a * b));
}

export function invertMatrix(A: number[][]): number[][] {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
  ]);

  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    let maxVal = Math.abs(aug[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > maxVal) {
        maxVal = Math.abs(aug[k][i]);
        pivotRow = k;
      }
    }

    if (pivotRow !== i) {
      const temp = aug[i];
      aug[i] = aug[pivotRow];
      aug[pivotRow] = temp;
    }

    let pivot = aug[i][i];
    if (Math.abs(pivot) < 1e-12) {
      pivot = 1e-12;
    }
    const invPivot = 1.0 / pivot;
    aug[i] = aug[i].map(val => val * invPivot);

    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = aug[r][i];
        if (Math.abs(factor) > 1e-15) {
          for (let c = 0; c < 2 * n; c++) {
            aug[r][c] -= factor * aug[i][c];
          }
        }
      }
    }
  }

  return aug.map(row => row.slice(n));
}

export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = A[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(1e-12, val));
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }

  return L;
}

export function sampleNormal(mean = 0, std = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function sampleMultivariateNormal(mean: number[], cov: number[][]): number[] {
  const L = cholesky(cov);
  const z = mean.map(() => sampleNormal(0, 1));
  return vecAdd(mean, matVecMul(L, z));
}

// --- Context Feature Preprocessing ---

export function extractFeatures(snapshot: Snapshot, decisionTimeStr: string): number[] {
  const skill = snapshot.skill_estimate;
  const skillVal = skill === null ? 0.50 : Number(skill);

  const recent = snapshot.recent_results || [];
  let successRate = 0.50;
  let indepRate = 0.50;
  let streak = 0;

  if (recent.length > 0) {
    successRate = recent.filter(r => r.success).length / recent.length;
    indepRate = recent.filter(r => r.independent).length / recent.length;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (!recent[i].success) {
        streak++;
      } else {
        break;
      }
    }
  }

  const hints = snapshot.hint_history || [];
  const hintFreq = hints.length > 0
    ? hints.reduce((acc, h) => acc + h.count, 0) / hints.length
    : 0.0;

  const riskObj = snapshot.c3_risk;
  let c3Val = 0.0;
  let c3Conf = 0.0;
  let c3WeightedRisk = 0.0;
  let c3Known = 0.0;
  let c3Missing = 1.0;

  if (riskObj && riskObj.expires_at > decisionTimeStr) {
    c3Val = Number(riskObj.value);
    c3Conf = Number(riskObj.confidence);
    c3WeightedRisk = c3Val * c3Conf;
    c3Known = 1.0;
    c3Missing = 0.0;
  }

  return [
    skillVal,
    successRate,
    indepRate,
    hintFreq,
    c3WeightedRisk,
    c3Conf,
    c3Known,
    c3Missing,
    Number(streak)
  ];
}

// --- Context Encoder MLP ---

export class ContextEncoderMLP {
  inDim: number;
  h1Dim: number;
  h2Dim: number;
  outDim: number;
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
  W3: number[][];
  b3: number[];

  constructor(weights: typeof browserModelData.weights) {
    this.inDim = weights.in_dim;
    this.h1Dim = weights.h1_dim;
    this.h2Dim = weights.h2_dim;
    this.outDim = weights.out_dim;
    this.W1 = weights.W1;
    this.b1 = weights.b1;
    this.W2 = weights.W2;
    this.b2 = weights.b2;
    this.W3 = weights.W3;
    this.b3 = weights.b3;
  }

  encode(x: number[]): number[] {
    // Layer 1: 9 -> 32
    const h1 = new Array(this.h1Dim).fill(0);
    for (let j = 0; j < this.h1Dim; j++) {
      let s = this.b1[j];
      for (let i = 0; i < this.inDim; i++) {
        s += x[i] * this.W1[i][j];
      }
      h1[j] = Math.max(0.0, s); // ReLU
    }

    // Layer 2: 32 -> 16
    const h2 = new Array(this.h2Dim).fill(0);
    for (let j = 0; j < this.h2Dim; j++) {
      let s = this.b2[j];
      for (let i = 0; i < this.h1Dim; i++) {
        s += h1[i] * this.W2[i][j];
      }
      h2[j] = Math.max(0.0, s); // ReLU
    }

    return h2;
  }
}

// --- Bayesian Linear Head ---

export class BayesianLinearHead {
  dim: number;
  sigma2: number;
  priorPrec: number;
  m: number[];
  S: number[][];
  sumXy: number[];
  private _cov: number[][] | null = null;

  constructor(featureDim = 17, priorPrecision = 10.0, noiseVariance = 1.0) {
    this.dim = featureDim;
    this.sigma2 = noiseVariance;
    this.priorPrec = priorPrecision;
    this.m = new Array(this.dim).fill(0.0);
    this.S = Array.from({ length: this.dim }, (_, i) =>
      Array.from({ length: this.dim }, (_, j) => (i === j ? priorPrecision : 0.0))
    );
    this.sumXy = new Array(this.dim).fill(0.0);
  }

  get covariance(): number[][] {
    if (!this._cov) {
      this._cov = invertMatrix(this.S);
    }
    return this._cov;
  }

  update(x: number[], reward: number): void {
    const invNoise = 1.0 / this.sigma2;
    const xxT = outerProduct(x, x);
    for (let i = 0; i < this.dim; i++) {
      this.sumXy[i] += invNoise * x[i] * reward;
      for (let j = 0; j < this.dim; j++) {
        this.S[i][j] += invNoise * xxT[i][j];
      }
    }
    this._cov = invertMatrix(this.S);
    this.m = matVecMul(this._cov, this.sumXy);
  }

  sampleWeights(): number[] {
    return sampleMultivariateNormal(this.m, this.covariance);
  }

  predictMean(x: number[]): number {
    return vecDot(this.m, x);
  }
}

// --- Policies ---

export class SCPABanditPolicy {
  name = 'SCPA_Full';
  encoder: ContextEncoderMLP;
  means: number[];
  stds: number[];
  heads: Record<ActionVariant, BayesianLinearHead>;

  constructor() {
    this.encoder = new ContextEncoderMLP(browserModelData.weights);
    this.means = preprocessingData.means;
    this.stds = preprocessingData.stds;
    this.heads = {
      easy_visual: new BayesianLinearHead(17),
      easy_text: new BayesianLinearHead(17),
      medium_visual: new BayesianLinearHead(17),
      medium_text: new BayesianLinearHead(17)
    };
  }

  reset(): void {
    this.heads = {
      easy_visual: new BayesianLinearHead(17),
      easy_text: new BayesianLinearHead(17),
      medium_visual: new BayesianLinearHead(17),
      medium_text: new BayesianLinearHead(17)
    };
  }

  getFeatureVector(snapshot: Snapshot): number[] {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const normFeats = rawFeats.map((f, i) => (f - this.means[i]) / (this.stds[i] || 1.0));
    const phi = this.encoder.encode(normFeats);
    return [1.0, ...phi];
  }

  selectAction(
    snapshot: Snapshot,
    eligibleActions: ActionVariant[]
  ): {
    selected_action: ActionVariant | null;
    explainability: ExplainabilityData;
  } {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const risk = snapshot.c3_risk;
    const c3Expired = !risk || risk.expires_at <= decTime;
    const c3Status = risk && !c3Expired ? 'known' : 'unknown';

    const scores: Record<ActionVariant, number> = {
      easy_visual: 0,
      easy_text: 0,
      medium_visual: 0,
      medium_text: 0
    };

    if (!eligibleActions || eligibleActions.length === 0) {
      const explainability: ExplainabilityData = {
        selected_action: null,
        scores,
        eligible_actions: [],
        c3_risk_level: risk ? risk.value : 0,
        c3_confidence: risk ? risk.confidence : 0,
        c3_status: c3Status,
        c3_expired: c3Expired,
        reason: 'No eligible actions available. Safety limit reached or teacher restricted all activities.',
        context_features: {
          skill_estimate: rawFeats[0],
          success_rate: rawFeats[1],
          independence_rate: rawFeats[2],
          hint_frequency: rawFeats[3],
          c3_weighted_risk: rawFeats[4],
          c3_confidence: rawFeats[5],
          c3_is_known: rawFeats[6],
          c3_is_missing: rawFeats[7],
          consecutive_failures: rawFeats[8]
        }
      };
      return { selected_action: null, explainability };
    }

    const x = this.getFeatureVector(snapshot);
    let bestAction: ActionVariant | null = null;
    let bestScore = -Infinity;

    for (const action of eligibleActions) {
      const head = this.heads[action];
      const sampleW = head.sampleWeights();
      const score = vecDot(sampleW, x) + (Math.random() - 0.5) * 1e-5;
      scores[action] = Math.round(score * 1000) / 1000;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    const explainability: ExplainabilityData = {
      selected_action: bestAction,
      scores,
      eligible_actions: eligibleActions,
      c3_risk_level: risk ? risk.value : 0,
      c3_confidence: risk ? risk.confidence : 0,
      c3_status: c3Status,
      c3_expired: c3Expired,
      reason: `Masked Thompson Sampling selected '${bestAction}' with highest sampled expected reward (${bestScore.toFixed(2)}) based on current skill, recent outcomes, and C3 affective context.`,
      context_features: {
        skill_estimate: rawFeats[0],
        success_rate: rawFeats[1],
        independence_rate: rawFeats[2],
        hint_frequency: rawFeats[3],
        c3_weighted_risk: rawFeats[4],
        c3_confidence: rawFeats[5],
        c3_is_known: rawFeats[6],
        c3_is_missing: rawFeats[7],
        consecutive_failures: rawFeats[8]
      }
    };

    return { selected_action: bestAction, explainability };
  }

  update(snapshot: Snapshot, actionId: ActionVariant, reward: number): void {
    if (this.heads[actionId]) {
      const x = this.getFeatureVector(snapshot);
      this.heads[actionId].update(x, reward);
    }
  }
}

export class SCPANoConfidenceWeightPolicy extends SCPABanditPolicy {
  constructor() {
    super();
    this.name = 'SCPA_NoConfidenceWeight';
  }

  override getFeatureVector(snapshot: Snapshot): number[] {
    const snapCopy = JSON.parse(JSON.stringify(snapshot)) as Snapshot;
    if (snapCopy.c3_risk) {
      snapCopy.c3_risk.confidence = 1.0;
    }
    return super.getFeatureVector(snapCopy);
  }
}

export class SCPANoSharedSignalsPolicy extends SCPABanditPolicy {
  constructor() {
    super();
    this.name = 'SCPA_NoSharedSignals';
  }

  override getFeatureVector(snapshot: Snapshot): number[] {
    const snapCopy = JSON.parse(JSON.stringify(snapshot)) as Snapshot;
    snapCopy.c3_risk = null;
    snapCopy.confirmed_requests = [];
    return super.getFeatureVector(snapCopy);
  }
}

export class EducatorRulesPolicy {
  name = 'Educator_Rules';

  reset(): void {}

  selectAction(
    snapshot: Snapshot,
    eligibleActions: ActionVariant[]
  ): {
    selected_action: ActionVariant | null;
    explainability: ExplainabilityData;
  } {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const risk = snapshot.c3_risk;
    const c3Expired = !risk || risk.expires_at <= decTime;
    const c3Status = risk && !c3Expired ? 'known' : 'unknown';

    if (!eligibleActions || eligibleActions.length === 0) {
      return {
        selected_action: null,
        explainability: {
          selected_action: null,
          scores: { easy_visual: 0, easy_text: 0, medium_visual: 0, medium_text: 0 },
          eligible_actions: [],
          c3_risk_level: risk ? risk.value : 0,
          c3_confidence: risk ? risk.confidence : 0,
          c3_status: c3Status,
          c3_expired: c3Expired,
          reason: 'No eligible actions available under Educator Rules.',
          context_features: {
            skill_estimate: rawFeats[0],
            success_rate: rawFeats[1],
            independence_rate: rawFeats[2],
            hint_frequency: rawFeats[3],
            c3_weighted_risk: rawFeats[4],
            c3_confidence: rawFeats[5],
            c3_is_known: rawFeats[6],
            c3_is_missing: rawFeats[7],
            consecutive_failures: rawFeats[8]
          }
        }
      };
    }

    const recent = snapshot.recent_results || [];
    const lastResult = recent[recent.length - 1];
    const lastSuccess = lastResult ? lastResult.success : true;
    const lastIndep = lastResult ? lastResult.independent : true;
    const highRisk = risk && !c3Expired && risk.value >= 0.60;

    let preferred: ActionVariant[];
    let ruleReason = '';

    if (highRisk || !lastSuccess) {
      preferred = ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'];
      ruleReason = 'Educator Rule: High frustration risk or recent failure detected; stepping back to supportive Easy Visual presentation.';
    } else if (lastSuccess && lastIndep) {
      preferred = ['medium_visual', 'medium_text', 'easy_text', 'easy_visual'];
      ruleReason = 'Educator Rule: Independent success achieved; advancing difficulty to Medium.';
    } else {
      preferred = ['easy_text', 'medium_visual', 'easy_visual', 'medium_text'];
      ruleReason = 'Educator Rule: Transitioning to intermediate presentation.';
    }

    let selectedAction: ActionVariant = eligibleActions[0];
    for (const candidate of preferred) {
      if (eligibleActions.includes(candidate)) {
        selectedAction = candidate;
        break;
      }
    }

    return {
      selected_action: selectedAction,
      explainability: {
        selected_action: selectedAction,
        scores: { easy_visual: 0.8, easy_text: 0.6, medium_visual: 0.4, medium_text: 0.2 },
        eligible_actions: eligibleActions,
        c3_risk_level: risk ? risk.value : 0,
        c3_confidence: risk ? risk.confidence : 0,
        c3_status: c3Status,
        c3_expired: c3Expired,
        reason: ruleReason,
        context_features: {
          skill_estimate: rawFeats[0],
          success_rate: rawFeats[1],
          independence_rate: rawFeats[2],
          hint_frequency: rawFeats[3],
          c3_weighted_risk: rawFeats[4],
          c3_confidence: rawFeats[5],
          c3_is_known: rawFeats[6],
          c3_is_missing: rawFeats[7],
          consecutive_failures: rawFeats[8]
        }
      }
    };
  }

  update(): void {}
}

export class FixedSequencingPolicy {
  name = 'Fixed_Sequencing';
  idx = 0;
  order: ActionVariant[] = ['easy_visual', 'easy_text', 'medium_visual', 'medium_text'];

  reset(): void {
    this.idx = 0;
  }

  selectAction(
    snapshot: Snapshot,
    eligibleActions: ActionVariant[]
  ): {
    selected_action: ActionVariant | null;
    explainability: ExplainabilityData;
  } {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const risk = snapshot.c3_risk;

    if (!eligibleActions || eligibleActions.length === 0) {
      return {
        selected_action: null,
        explainability: {
          selected_action: null,
          scores: { easy_visual: 0, easy_text: 0, medium_visual: 0, medium_text: 0 },
          eligible_actions: [],
          c3_risk_level: risk ? risk.value : 0,
          c3_confidence: risk ? risk.confidence : 0,
          c3_status: 'unknown',
          c3_expired: true,
          reason: 'No eligible actions available in fixed sequence.',
          context_features: {
            skill_estimate: rawFeats[0],
            success_rate: rawFeats[1],
            independence_rate: rawFeats[2],
            hint_frequency: rawFeats[3],
            c3_weighted_risk: rawFeats[4],
            c3_confidence: rawFeats[5],
            c3_is_known: rawFeats[6],
            c3_is_missing: rawFeats[7],
            consecutive_failures: rawFeats[8]
          }
        }
      };
    }

    let selected: ActionVariant = eligibleActions[0];
    for (let i = 0; i < this.order.length; i++) {
      const cand = this.order[(this.idx + i) % this.order.length];
      if (eligibleActions.includes(cand)) {
        selected = cand;
        this.idx = (this.idx + i + 1) % this.order.length;
        break;
      }
    }

    return {
      selected_action: selected,
      explainability: {
        selected_action: selected,
        scores: { easy_visual: 0.5, easy_text: 0.5, medium_visual: 0.5, medium_text: 0.5 },
        eligible_actions: eligibleActions,
        c3_risk_level: risk ? risk.value : 0,
        c3_confidence: risk ? risk.confidence : 0,
        c3_status: 'unknown',
        c3_expired: true,
        reason: `Fixed Curriculum: Step ${this.idx} in fixed cyclical order [Easy Visual -> Easy Text -> Medium Visual -> Medium Text].`,
        context_features: {
          skill_estimate: rawFeats[0],
          success_rate: rawFeats[1],
          independence_rate: rawFeats[2],
          hint_frequency: rawFeats[3],
          c3_weighted_risk: rawFeats[4],
          c3_confidence: rawFeats[5],
          c3_is_known: rawFeats[6],
          c3_is_missing: rawFeats[7],
          consecutive_failures: rawFeats[8]
        }
      }
    };
  }

  update(): void {}
}

export class LinearBanditPolicy {
  name = 'Linear_Bandit';
  means: number[];
  stds: number[];
  heads: Record<ActionVariant, BayesianLinearHead>;

  constructor() {
    this.means = preprocessingData.means;
    this.stds = preprocessingData.stds;
    this.heads = {
      easy_visual: new BayesianLinearHead(10),
      easy_text: new BayesianLinearHead(10),
      medium_visual: new BayesianLinearHead(10),
      medium_text: new BayesianLinearHead(10)
    };
  }

  reset(): void {
    this.heads = {
      easy_visual: new BayesianLinearHead(10),
      easy_text: new BayesianLinearHead(10),
      medium_visual: new BayesianLinearHead(10),
      medium_text: new BayesianLinearHead(10)
    };
  }

  getFeatureVector(snapshot: Snapshot): number[] {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const normFeats = rawFeats.map((f, i) => (f - this.means[i]) / (this.stds[i] || 1.0));
    return [1.0, ...normFeats];
  }

  selectAction(
    snapshot: Snapshot,
    eligibleActions: ActionVariant[]
  ): {
    selected_action: ActionVariant | null;
    explainability: ExplainabilityData;
  } {
    const decTime = snapshot.decision_time || new Date().toISOString();
    const rawFeats = extractFeatures(snapshot, decTime);
    const risk = snapshot.c3_risk;
    const c3Expired = !risk || risk.expires_at <= decTime;
    const c3Status = risk && !c3Expired ? 'known' : 'unknown';

    if (!eligibleActions || eligibleActions.length === 0) {
      return {
        selected_action: null,
        explainability: {
          selected_action: null,
          scores: { easy_visual: 0, easy_text: 0, medium_visual: 0, medium_text: 0 },
          eligible_actions: [],
          c3_risk_level: risk ? risk.value : 0,
          c3_confidence: risk ? risk.confidence : 0,
          c3_status: c3Status,
          c3_expired: c3Expired,
          reason: 'No eligible actions available for Linear Bandit.',
          context_features: {
            skill_estimate: rawFeats[0],
            success_rate: rawFeats[1],
            independence_rate: rawFeats[2],
            hint_frequency: rawFeats[3],
            c3_weighted_risk: rawFeats[4],
            c3_confidence: rawFeats[5],
            c3_is_known: rawFeats[6],
            c3_is_missing: rawFeats[7],
            consecutive_failures: rawFeats[8]
          }
        }
      };
    }

    const x = this.getFeatureVector(snapshot);
    let bestAction: ActionVariant | null = null;
    let bestScore = -Infinity;
    const scores: Record<ActionVariant, number> = {
      easy_visual: 0,
      easy_text: 0,
      medium_visual: 0,
      medium_text: 0
    };

    for (const action of eligibleActions) {
      const sampleW = this.heads[action].sampleWeights();
      const score = vecDot(sampleW, x) + (Math.random() - 0.5) * 1e-5;
      scores[action] = Math.round(score * 1000) / 1000;
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return {
      selected_action: bestAction,
      explainability: {
        selected_action: bestAction,
        scores,
        eligible_actions: eligibleActions,
        c3_risk_level: risk ? risk.value : 0,
        c3_confidence: risk ? risk.confidence : 0,
        c3_status: c3Status,
        c3_expired: c3Expired,
        reason: `Linear Bandit Thompson Sampling on 9 raw features selected '${bestAction}' (score: ${bestScore.toFixed(2)}).`,
        context_features: {
          skill_estimate: rawFeats[0],
          success_rate: rawFeats[1],
          independence_rate: rawFeats[2],
          hint_frequency: rawFeats[3],
          c3_weighted_risk: rawFeats[4],
          c3_confidence: rawFeats[5],
          c3_is_known: rawFeats[6],
          c3_is_missing: rawFeats[7],
          consecutive_failures: rawFeats[8]
        }
      }
    };
  }

  update(snapshot: Snapshot, actionId: ActionVariant, reward: number): void {
    if (this.heads[actionId]) {
      const x = this.getFeatureVector(snapshot);
      this.heads[actionId].update(x, reward);
    }
  }
}

// Factory function
export function createPolicy(type: PolicyType) {
  switch (type) {
    case 'SCPA_Full':
      return new SCPABanditPolicy();
    case 'SCPA_NoSharedSignals':
      return new SCPANoSharedSignalsPolicy();
    case 'SCPA_NoConfidenceWeight':
      return new SCPANoConfidenceWeightPolicy();
    case 'Educator_Rules':
      return new EducatorRulesPolicy();
    case 'Fixed_Sequencing':
      return new FixedSequencingPolicy();
    case 'Linear_Bandit':
      return new LinearBanditPolicy();
    default:
      return new SCPABanditPolicy();
  }
}
