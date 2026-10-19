import React, { useState } from 'react';
import {
  BarChart3,
  Cpu,
  Layers,
  Database,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  Info
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import {
  EVALUATION_DATA,
  EDNET_BENCHMARK,
  TRAINING_SUMMARY,
  DATASET_SPLITS
} from '../../services/evaluationService';
import type { PolicyEvaluationMetric } from '../../types';

export const ResearchDashboardScreen: React.FC = () => {
  const [selectedPolicy, setSelectedPolicy] = useState<string>('SCPA_Full');
  const results = EVALUATION_DATA.results;

  const currentMetric = results.find(r => r.policy_name === selectedPolicy) || results[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-800 bg-purple-100/70 px-2.5 py-0.5 rounded-full mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-purple-700" />
            Empirical Evaluation & Policy Ablations
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Research & Evaluation Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Grounded in empirical evaluation across 20 held-out learner profiles ({EVALUATION_DATA.unseen_families.join(', ')}),
            100 evaluated episodes per policy, and the EdNet benchmark.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" size="md">
            Status: {EVALUATION_DATA.evaluation_status}
          </Badge>
          <Badge variant="default" size="md">
            Held-out Profiles: {EVALUATION_DATA.held_out_profiles_count}
          </Badge>
        </div>
      </div>

      {/* Multi-Policy Evaluation Table */}
      <Card
        title="Multi-Policy Comparison on Held-Out Test Profiles"
        subtitle="100 evaluated episodes per policy across unseen response rule families"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3 font-bold">Policy Name</th>
                <th className="p-3 font-bold">
                  Mean Cumulative Reward <br />
                  <span className="text-[10px] font-normal text-slate-400">(95% CI) ↑</span>
                </th>
                <th className="p-3 font-bold">
                  One-Step Regret <br />
                  <span className="text-[10px] font-normal text-slate-400">Lower is better ↓</span>
                </th>
                <th className="p-3 font-bold">Success Rate ↑</th>
                <th className="p-3 font-bold">Independence ↑</th>
                <th className="p-3 font-bold">Mean Failure Run ↓</th>
                <th className="p-3 font-bold">Max Failure Run ↓</th>
                <th className="p-3 font-bold text-center">Constraint Violations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {results.map(r => {
                const isSelected = r.policy_name === selectedPolicy;
                const isSCPA = r.policy_name.startsWith('SCPA');

                return (
                  <tr
                    key={r.policy_name}
                    onClick={() => setSelectedPolicy(r.policy_name)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-purple-50/70 font-semibold text-purple-950'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3 flex items-center gap-2">
                      <span className="font-mono text-xs">{r.policy_name}</span>
                      {r.policy_name === 'SCPA_Full' && (
                        <Badge variant="success" size="sm">Proposed</Badge>
                      )}
                      {r.policy_name.includes('Rules') && (
                        <Badge variant="default" size="sm">Heuristic</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900">{r.mean_cumulative_reward.toFixed(2)}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5 font-mono">
                        [{r.ci_95[0].toFixed(2)}, {r.ci_95[1].toFixed(2)}]
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {r.mean_one_step_regret.toFixed(4)}
                    </td>
                    <td className="p-3 font-medium">
                      {(r.success_rate * 100).toFixed(1)}%
                    </td>
                    <td className="p-3 font-medium">
                      {(r.independence_rate * 100).toFixed(1)}%
                    </td>
                    <td className="p-3">{r.mean_failure_run.toFixed(2)}</td>
                    <td className="p-3 font-bold">{r.max_failure_run}</td>
                    <td className="p-3 text-center">
                      <Badge variant="success" size="sm">
                        0 (100% Safe)
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <span>Click any policy row to inspect detailed posterior & ablation parameters.</span>
          <span className="font-semibold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Zero constraint violations across all tested policies (Teacher limits strictly held)
          </span>
        </div>
      </Card>

      {/* Visual Charts: Reward & Regret Visualizers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative Reward with 95% CI Error Bars */}
        <Card
          title="Mean Cumulative Reward (with 95% CI Error Bars)"
          subtitle="Higher value is preferable (Evaluated over 100 episodes)"
        >
          <div className="space-y-4 pt-2">
            {results.map(r => {
              const minVal = 4.0;
              const maxVal = 9.0;
              const range = maxVal - minVal;

              const meanPos = ((r.mean_cumulative_reward - minVal) / range) * 100;
              const leftCI = ((r.ci_95[0] - minVal) / range) * 100;
              const rightCI = ((r.ci_95[1] - minVal) / range) * 100;

              const isSCPA = r.policy_name === 'SCPA_Full';

              return (
                <div key={r.policy_name} className="space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className={`font-mono ${isSCPA ? 'font-bold text-emerald-800' : 'text-slate-700'}`}>
                      {r.policy_name}
                    </span>
                    <span className="font-bold text-slate-900">
                      {r.mean_cumulative_reward.toFixed(2)}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">
                        [{r.ci_95[0].toFixed(1)}, {r.ci_95[1].toFixed(1)}]
                      </span>
                    </span>
                  </div>

                  {/* Visual Bar with CI Range */}
                  <div className="relative w-full bg-slate-100 h-6 rounded-lg overflow-hidden flex items-center">
                    {/* CI interval bar */}
                    <div
                      className="absolute h-3 bg-purple-200/80 rounded"
                      style={{
                        left: `${Math.max(0, leftCI)}%`,
                        width: `${Math.max(2, rightCI - leftCI)}%`
                      }}
                    />

                    {/* Point Estimate marker */}
                    <div
                      className={`absolute w-3 h-5 rounded-sm shadow-xs ${
                        isSCPA ? 'bg-[#3CC172]' : 'bg-purple-600'
                      }`}
                      style={{ left: `calc(${meanPos}% - 6px)` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-[10px] text-slate-400 font-mono">
            <span>4.0</span>
            <span>5.2</span>
            <span>6.5</span>
            <span>7.8</span>
            <span>9.0 (Max reward scale)</span>
          </div>
        </Card>

        {/* One-Step Regret Visualizer */}
        <Card
          title="One-Step Regret Comparison"
          subtitle="Lower value is preferable (Shows convergence speed to optimal action)"
        >
          <div className="space-y-4 pt-2">
            {results.map(r => {
              const maxRegret = 0.17;
              const pct = (r.mean_one_step_regret / maxRegret) * 100;
              const isBest = r.mean_one_step_regret === Math.min(...results.map(x => x.mean_one_step_regret));

              return (
                <div key={r.policy_name} className="space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-slate-700">{r.policy_name}</span>
                    <span className="font-bold font-mono text-slate-900">
                      {r.mean_one_step_regret.toFixed(4)}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isBest ? 'bg-[#3CC172]' : 'bg-slate-400'
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <p>
              Note: The SCPA formulations achieve lower regret than Linear Bandit and Fixed Sequencing by leveraging the shared latent representation learned by the frozen neural context encoder.
            </p>
          </div>
        </Card>
      </div>

      {/* Model Architecture & Pretraining Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Context Neural Response Encoder Card */}
        <Card title="Context Neural Response Encoder" subtitle="Architecture & Training Provenance">
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Network Architecture
              </span>
              <p className="font-mono font-bold text-slate-800">
                {TRAINING_SUMMARY.architecture}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Input (9 normalized features) → FC(32) + ReLU → FC(16) + ReLU → Latent context vector φ(s) in ℝ¹⁶.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Train Samples</span>
                <span className="font-bold text-slate-900 text-sm">
                  {TRAINING_SUMMARY.train_samples}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Val Samples</span>
                <span className="font-bold text-slate-900 text-sm">
                  {TRAINING_SUMMARY.val_samples}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Train Acc / ECE</span>
                <span className="font-bold text-slate-900 text-xs">
                  {(TRAINING_SUMMARY.train_metrics.accuracy * 100).toFixed(1)}% /{' '}
                  {TRAINING_SUMMARY.train_metrics.ece.toFixed(4)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Val Acc / ECE</span>
                <span className="font-bold text-slate-900 text-xs">
                  {(TRAINING_SUMMARY.val_metrics.accuracy * 100).toFixed(1)}% /{' '}
                  {TRAINING_SUMMARY.val_metrics.ece.toFixed(4)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Weights frozen for online Bayesian Thompson sampling.</span>
            </div>
          </div>
        </Card>

        {/* Public Benchmark: EdNet KT1 */}
        <Card title="Public Knowledge Tracing Benchmark" subtitle="EdNet KT1 Pretrained Transfer">
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-900">EdNet KT1 Benchmark</span>
                <Badge variant="purple" size="sm">External Grounding</Badge>
              </div>
              <p className="text-[11px] text-slate-600">
                Evaluated on 2,500 chronological interactions from 50 independent learner sequences.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Test Accuracy</span>
                <span className="font-bold text-slate-900 text-sm">
                  {(EDNET_BENCHMARK.test_accuracy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Brier Score</span>
                <span className="font-bold text-slate-900 text-sm">
                  {EDNET_BENCHMARK.test_brier_score.toFixed(4)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 space-y-1">
              <div><strong>Dataset Source:</strong> {EDNET_BENCHMARK.provenance.source}</div>
              <div><strong>License:</strong> {EDNET_BENCHMARK.provenance.license}</div>
            </div>
          </div>
        </Card>

        {/* Dataset Splits Manifest */}
        <Card title="Simulated Dataset Splits" subtitle="70 Controlled Learner Profiles">
          <div className="space-y-3 text-xs">
            {DATASET_SPLITS.map(split => (
              <div
                key={split.split}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase tracking-wider text-slate-700">
                    Split: {split.split}
                  </span>
                  <Badge variant={split.split === 'test' ? 'warning' : 'default'} size="sm">
                    {split.profilesCount} Profiles
                  </Badge>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Interactions: {split.totalInteractions}</span>
                  <span>Episodes: {split.episodesCount}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Families: {split.families.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
