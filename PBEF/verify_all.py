"""
verify_all.py
=============
Component 3 (PBEF) — Master Verification and Technical Audit Script

Executes the entire end-to-end verification protocol in a strict, safe,
fail-fast sequence with explicit assertions, checking:
  1. Python pipeline unit tests
  2. Client-side TypeScript logger tests and type-checking
  3. Window extraction and zero-leakage calibration constraints
  4. Dataset partitioning (participant isolation, 0% overlap, 100% window assignment)
  5. 7-model benchmark execution and result integrity
  6. Event-level advance warning metrics against discrete ground-truth onsets
  7. ONNX export and multi-case numerical parity tolerances (<= 1.2e-7)

Usage:
  python verify_all.py
"""

import os
import sys
import json
import subprocess
import numpy as np
import pandas as pd
import torch

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def print_header(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def run_step(cmd, cwd=BASE_DIR, description=""):
    print(f"\n[RUNNING] {description}...")
    print(f"Command: {cmd} (cwd: {cwd})")
    res = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[FAIL] Command failed with exit code {res.returncode}")
        if res.stdout:
            print("--- STDOUT ---")
            print(res.stdout[-1000:])
        if res.stderr:
            print("--- STDERR ---")
            print(res.stderr[-1000:])
        sys.exit(res.returncode)
    else:
        print(f"[PASS] {description} succeeded.")
        return res.stdout


def verify_partition_integrity():
    print_header("AUDIT CHECK: Partition Integrity & Leakage Prevention")
    npz_path = os.path.join(BASE_DIR, "data", "synthetic", "windows.npz")
    man_path = os.path.join(BASE_DIR, "data", "synthetic", "window_manifest.csv")

    assert os.path.exists(npz_path), f"Missing {npz_path}"
    assert os.path.exists(man_path), f"Missing {man_path}"

    data = np.load(npz_path)
    mask = data['mask']
    valid_idx = np.where(mask == 1)[0]
    manifest = pd.read_csv(man_path).iloc[valid_idx].reset_index(drop=True)

    print(f"Total candidate windows: {len(mask)}")
    print(f"Excluded invalid windows: {np.sum(mask == 0)}")
    print(f"Valid eligible windows: {len(manifest)}")

    # Check minimum cutoff timestamp (must be >= 60000ms to eliminate calibration leakage)
    min_cutoff = manifest['cutoff_time_ms'].min()
    print(f"Earliest window cutoff time: {min_cutoff / 1000:.1f}s")
    assert min_cutoff >= 60000, f"LEAKAGE DETECTED: Window starts before 60s calibration! ({min_cutoff}ms)"
    print("  -> Calibration isolation: CONFIRMED (0% intra-session calibration leakage).")

    # Check splits
    test_mask = (manifest['learner_id'] == 'L003').to_numpy()
    val_mask = (manifest['learner_id'].isin(['L001', 'L002']) & manifest['session_id'].str.endswith('_03')).to_numpy()
    train_mask = (manifest['learner_id'].isin(['L001', 'L002']) & ~manifest['session_id'].str.endswith('_03')).to_numpy()

    assert not np.any(train_mask & val_mask), "Train and Val overlap!"
    assert not np.any(train_mask & test_mask), "Train and Test overlap!"
    assert not np.any(val_mask & test_mask), "Val and Test overlap!"
    assert train_mask.sum() + val_mask.sum() + test_mask.sum() == len(manifest), "Unassigned windows!"

    assert set(manifest.loc[test_mask, 'learner_id']) == {'L003'}
    assert set(manifest.loc[train_mask, 'learner_id']) <= {'L001', 'L002'}
    assert set(manifest.loc[val_mask, 'learner_id']) <= {'L001', 'L002'}

    expected_train_sessions = {'S_L001_01', 'S_L001_02', 'S_L002_01', 'S_L002_02'}
    expected_val_sessions = {'S_L001_03', 'S_L002_03'}
    expected_test_sessions = {'S_L003_01', 'S_L003_02', 'S_L003_03'}

    assert set(manifest.loc[train_mask, 'session_id']) == expected_train_sessions
    assert set(manifest.loc[val_mask, 'session_id']) == expected_val_sessions
    assert set(manifest.loc[test_mask, 'session_id']) == expected_test_sessions

    print(f"  -> Train partition: {train_mask.sum()} windows (Sessions: {sorted(list(expected_train_sessions))})")
    print(f"  -> Val partition:   {val_mask.sum()} windows (Sessions: {sorted(list(expected_val_sessions))})")
    print(f"  -> Test partition:  {test_mask.sum()} windows (Sessions: {sorted(list(expected_test_sessions))})")
    print("  -> Complete participant & session isolation: CONFIRMED.")


def verify_benchmark_metrics():
    print_header("AUDIT CHECK: Benchmark & Event Metrics Validation")
    bench_json_path = os.path.join(BASE_DIR, "results", "metrics", "benchmark_comparison.json")
    event_json_path = os.path.join(BASE_DIR, "results", "metrics", "event_metrics.json")

    assert os.path.exists(bench_json_path), f"Missing {bench_json_path}"
    assert os.path.exists(event_json_path), f"Missing {event_json_path}"

    with open(bench_json_path, 'r') as f:
        bench_data = json.load(f)

    with open(event_json_path, 'r') as f:
        event_data = json.load(f)

    assert len(bench_data) == 7, f"Expected 7 models in benchmark, found {len(bench_data)}"
    model_names = [m['model_name'] for m in bench_data]
    print(f"Verified all 7 models present in benchmark:")
    for i, name in enumerate(model_names, 1):
        print(f"  {i}. {name}")

    # Check Deterministic Rule has null ranking metrics (discrete step function)
    det_rule = next(m for m in bench_data if "Deterministic" in m['model_name'])
    assert det_rule['pr_auc'] is None, "Deterministic rule must report null PR-AUC (hard binary decisions)"
    assert det_rule['roc_auc'] is None, "Deterministic rule must report null ROC-AUC (hard binary decisions)"
    print("  -> Deterministic Rule metric integrity (null AUCs): CONFIRMED.")

    # Check Personal Baseline vs Population Baseline gain
    pop_tcn = next(m for m in bench_data if "Population" in m['model_name'])
    pers_tcn = next(m for m in bench_data if "Personal Baseline" in m['model_name'])
    print(f"  -> Population TCN PR-AUC: {pop_tcn['pr_auc']:.4f}")
    print(f"  -> Personal TCN PR-AUC:   {pers_tcn['pr_auc']:.4f}")
    rel_gain = (pers_tcn['pr_auc'] - pop_tcn['pr_auc']) / pop_tcn['pr_auc'] * 100
    print(f"  -> Relative gain from personal baseline normalization: +{rel_gain:.1f}%")
    assert pers_tcn['pr_auc'] > pop_tcn['pr_auc'], "Personal baseline should outperform population baseline!"

    # Check Event Metrics
    print(f"\nEvent-Level Metrics:")
    print(f"  -> True onset episodes: {event_data['total_true_onset_episodes']}")
    print(f"  -> Matched alerts (TP): {event_data['true_positives_matched']}")
    print(f"  -> False alerts (FP):   {event_data['false_positives_unmatched']}")
    print(f"  -> Event recall:        {event_data['event_recall'] * 100:.2f}%")
    print(f"  -> False alerts / hour: {event_data['false_alerts_per_hour']:.2f}")
    print(f"  -> Mean lead time:      {event_data['mean_usable_lead_time_sec']:.2f}s")

    assert event_data['total_true_onset_episodes'] == 3, "Expected 3 true onsets in test split"
    assert event_data['true_positives_matched'] == 3, "Expected 3 matched alerts"
    assert event_data['mean_usable_lead_time_sec'] > 10.0, "Expected usable lead time > 10s"
    print("  -> Event evaluation against discrete onsets: CONFIRMED.")


def main():
    print_header("Component 3 (PBEF) — Master Technical Verification Suite")

    python_exe = sys.executable

    # Step 1: Python tests
    run_step(f'"{python_exe}" tests/test_pipeline.py', description="Python pipeline unit tests")

    # Step 2: TypeScript logger tests
    app_dir = os.path.join(BASE_DIR, "app")
    run_step("npm test", cwd=app_dir, description="TypeScript event logger tests")
    run_step("npm run type-check", cwd=app_dir, description="TypeScript compile and type-check")

    # Step 3: Build windows
    run_step(
        f'"{python_exe}" src/features/build_windows.py --aligned_dir data/synthetic --output_dir data/synthetic',
        description="Dataset window builder (t >= 60s)"
    )

    # Step 4: Verify partition integrity and calibration isolation
    verify_partition_integrity()

    # Step 5: Run benchmark comparison
    run_step(f'"{python_exe}" src/models/run_benchmark_comparison.py', description="7-model benchmark comparison & event evaluation")

    # Step 6: Validate metrics
    verify_benchmark_metrics()

    # Step 7: Export ONNX & verify numerical parity
    run_step(f'"{python_exe}" src/models/export_onnx.py', description="ONNX export & multi-case parity verification")

    print("\n" + "=" * 70)
    print("  ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0)!")
    print("  The PBEF Component 3 pipeline is fully verified and PP1-ready.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
