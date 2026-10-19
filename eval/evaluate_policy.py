"""
Policy Evaluation Harness for C2 Constrained Activity Selection.
Compares Proposed SCPA Bandit, Ablations, and Baselines on Held-Out Test Profiles.
Computes Cumulative Reward (with 95% Bootstrap CI), Constraint Violations, Regret, and Failure Runs.
"""
import copy
import json
import math
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sim.simulator import LearnerProfile, LearnerSimulator, CANONICAL_ACTIONS
from policy.baselines import FixedSequencingPolicy, EducatorRulesPolicy
from policy.policy import (
    SCPABanditPolicy,
    SCPANoConfidenceWeightPolicy,
    SCPANoSharedSignalsPolicy,
    LinearBanditPolicy
)

def bootstrap_ci(values: List[float], num_samples: int = 1000, ci: float = 0.95, seed: int = 501) -> Tuple[float, float, float]:
    """Computes mean and 95% bootstrap confidence interval."""
    if not values:
        return 0.0, 0.0, 0.0
    rng = random.Random(seed)
    n = len(values)
    mean_val = sum(values) / n
    boot_means = []
    for _ in range(num_samples):
        sample = [values[rng.randint(0, n - 1)] for _ in range(n)]
        boot_means.append(sum(sample) / n)
    boot_means.sort()
    lower_idx = int(((1.0 - ci) / 2.0) * num_samples)
    upper_idx = int((1.0 - (1.0 - ci) / 2.0) * num_samples)
    return mean_val, boot_means[lower_idx], boot_means[upper_idx]

def load_test_profiles() -> List[LearnerProfile]:
    """Loads the 20 held-out test profiles (unseen families)."""
    manifest_path = ROOT / "data/splits/split_manifest.csv"
    profiles = []
    with open(manifest_path, "r") as f:
        lines = f.read().strip().split("\n")
    headers = [h.strip() for h in lines[0].split(",")]

    for line in lines[1:]:
        row = dict(zip(headers, [x.strip() for x in line.split(",")]))
        if row["split"] == "test":
            seed = int(row["seed"])
            p_rng = random.Random(seed)
            p = LearnerProfile(
                profile_id=row["profile_id"],
                family=row["family"],
                starting_skill=float(row["starting_skill"]),
                learning_rate=round(p_rng.uniform(0.015, 0.045), 3),
                visual_preference=round(p_rng.uniform(-0.35, 0.35), 3),
                break_tendency=round(p_rng.uniform(0.03, 0.08), 3),
                distress_threshold=round(p_rng.uniform(0.65, 0.85), 3),
                seed=seed
            )
            profiles.append(p)
    return profiles

def evaluate_single_policy(policy, test_profiles: List[LearnerProfile], sessions_per_profile: int = 5, steps_per_session: int = 25):
    session_cumulative_rewards = []
    total_violations = 0
    all_regrets = []
    all_failure_runs = []
    total_tasks = 0
    total_successes = 0
    total_indep = 0

    for profile in test_profiles:
        profile_copy = copy.deepcopy(profile)
        sim = LearnerSimulator(profile_copy)

        for s_idx in range(sessions_per_profile):
            if hasattr(policy, "reset"):
                policy.reset()

            session_seed = profile.seed * 2000 + s_idx
            session_id = f"eval_{profile.profile_id}_{s_idx+1}"

            # Step-by-step evaluation loop with online policy updates
            profile_copy.reset_for_session(session_seed)
            records = []
            session_reward = 0.0
            curr_failure_run = 0

            # Wrapper policy_fn
            def eval_policy_step(snapshot, eligible_actions):
                nonlocal total_violations
                action = policy.select_action(snapshot, eligible_actions)
                # Verify safety invariant: selected action must be in allowed_actions
                if action is not None:
                    allowed = snapshot["teacher_limits"]["allowed_actions"]
                    if action not in allowed or action not in eligible_actions:
                        total_violations += 1
                return action

            session_records = sim.run_session(
                session_id=session_id,
                num_steps=steps_per_session,
                policy_fn=eval_policy_step,
                session_seed=session_seed
            )

            # Process outcomes and feed back to policy for online update
            for item in session_records:
                if item.get("status") == "completed":
                    dec = item["decision_event"]
                    out = item["outcome_event"]
                    reward = item["reward"]
                    session_reward += reward
                    total_tasks += 1
                    if out["outcome"]:
                        total_successes += 1
                        all_failure_runs.append(curr_failure_run)
                        curr_failure_run = 0
                    else:
                        curr_failure_run += 1

                    if out["independence"]:
                        total_indep += 1

                    # Compute 1-step regret vs optimal eligible action under simulator state
                    eligible = dec["eligible_actions"]
                    if eligible:
                        best_p = max(profile_copy.compute_success_probability(a) for a in eligible)
                        actual_p = item["p_success"]
                        regret = max(0.0, best_p - actual_p)
                        all_regrets.append(regret)

                    # Online recursive update for bandit policies
                    if hasattr(policy, "update"):
                        policy.update(dec["context_before_action"], out["selected_action"], reward)

            if curr_failure_run > 0:
                all_failure_runs.append(curr_failure_run)

            session_cumulative_rewards.append(session_reward)

    mean_rew, ci_low, ci_high = bootstrap_ci(session_cumulative_rewards)
    mean_regret = (sum(all_regrets) / len(all_regrets)) if all_regrets else 0.0
    max_fail = max(all_failure_runs) if all_failure_runs else 0
    mean_fail = (sum(all_failure_runs) / len(all_failure_runs)) if all_failure_runs else 0.0
    success_rate = (total_successes / total_tasks) if total_tasks else 0.0
    indep_rate = (total_indep / total_tasks) if total_tasks else 0.0

    return {
        "policy_name": getattr(policy, "name", str(policy)),
        "mean_cumulative_reward": round(mean_rew, 2),
        "ci_95": [round(ci_low, 2), round(ci_high, 2)],
        "constraint_violations": total_violations,
        "mean_one_step_regret": round(mean_regret, 4),
        "max_failure_run": max_fail,
        "mean_failure_run": round(mean_fail, 2),
        "success_rate": round(success_rate, 3),
        "independence_rate": round(indep_rate, 3),
        "evaluated_episodes": len(session_cumulative_rewards)
    }

def main():
    print("=" * 70)
    print("  EVALUATING C2 ACTIVITY SELECTION POLICIES ON HELD-OUT TEST PROFILES")
    print("=" * 70)

    test_profiles = load_test_profiles()
    print(f"Loaded {len(test_profiles)} held-out test profiles (unseen response families).")
    print("Evaluating 5 sessions per profile across all policies...\n")

    policies = [
        FixedSequencingPolicy(),
        EducatorRulesPolicy(),
        LinearBanditPolicy(),
        SCPANoSharedSignalsPolicy(),
        SCPANoConfidenceWeightPolicy(),
        SCPABanditPolicy()
    ]

    results = []
    for pol in policies:
        print(f"Running evaluation for policy: {pol.name}...")
        metrics = evaluate_single_policy(pol, test_profiles)
        results.append(metrics)
        print(f"  -> Mean Reward: {metrics['mean_cumulative_reward']} (95% CI: {metrics['ci_95']}) | Violations: {metrics['constraint_violations']}")

    # Save to metrics.json
    eval_dir = ROOT / "eval"
    eval_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = eval_dir / "metrics.json"

    eval_output = {
        "evaluation_status": "completed",
        "held_out_profiles_count": len(test_profiles),
        "unseen_families": ["threshold_mastery", "fatigue_recovery"],
        "policies_compared": [r["policy_name"] for r in results],
        "results": results
    }

    with open(metrics_path, "w") as f:
        json.dump(eval_output, f, indent=2)
    print(f"\nSaved structured evaluation results -> eval/metrics.json")

    # Print Formatted Comparison Table
    print("\n" + "=" * 88)
    print(f"{'Policy Name':<28} | {'Mean Reward (95% CI)':<22} | {'Violations':<10} | {'Regret':<8} | {'Success':<8}")
    print("-" * 88)
    for r in results:
        ci_str = f"{r['mean_cumulative_reward']} [{r['ci_95'][0]}, {r['ci_95'][1]}]"
        print(f"{r['policy_name']:<28} | {ci_str:<22} | {r['constraint_violations']:<10} | {r['mean_one_step_regret']:<8} | {r['success_rate']:<8}")
    print("=" * 88 + "\n")

if __name__ == "__main__":
    main()
