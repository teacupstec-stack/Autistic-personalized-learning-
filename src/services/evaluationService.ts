import metricsData from '../../eval/metrics.json';
import ednetData from '../../data/public_ednet/benchmark_metrics.json';
import trainingSummaryData from '../../models/training_summary.json';
import type { EvaluationData, PolicyEvaluationMetric } from '../types';

export const EVALUATION_DATA: EvaluationData = metricsData as EvaluationData;
export const EDNET_BENCHMARK = ednetData;
export const TRAINING_SUMMARY = trainingSummaryData;

export function getEvaluationResults(): PolicyEvaluationMetric[] {
  return EVALUATION_DATA.results;
}

export function getPolicyMetric(policyName: string): PolicyEvaluationMetric | undefined {
  return EVALUATION_DATA.results.find(r => r.policy_name === policyName);
}

export interface SplitSummary {
  split: 'train' | 'val' | 'test';
  profilesCount: number;
  episodesCount: number;
  totalInteractions: number;
  families: string[];
}

export const DATASET_SPLITS: SplitSummary[] = [
  {
    split: 'train',
    profilesCount: 40,
    episodesCount: 200,
    totalInteractions: 5000,
    families: ['additive_skill']
  },
  {
    split: 'val',
    profilesCount: 10,
    episodesCount: 50,
    totalInteractions: 1000,
    families: ['additive_skill']
  },
  {
    split: 'test',
    profilesCount: 20,
    episodesCount: 100,
    totalInteractions: 2500,
    families: ['threshold_mastery', 'fatigue_recovery']
  }
];
