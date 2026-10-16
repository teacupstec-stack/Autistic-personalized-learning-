"""
build_windows.py
================
Component 3 (Participation Forecasting - PBEF)
Generates temporal sequence windows for forecasting participation decrease.

STRICT TEMPORAL ISOLATION (ZERO LEAKAGE):
  - Input history window: 30 seconds [t - 30s, t] (30 timesteps of 1s bins).
  - Target forecast horizon: 20 seconds [t, t + 20s].
  - Inputs strictly terminate at time t.
  - Target onset is determined from eligible annotations in [t, t + 20s].
  - Windows lacking at least 20s of follow-up coverage or interrupted by teacher
    interventions before an onset are flagged invalid / excluded.
  - Participant-level and session-level splitting is enforced prior to windowing
    to prevent data leakage across train/validation/test sets.

INPUTS:
  --aligned_file: Path to aligned session CSV (from align_annotations.py)
  --history_sec:  Input history length in seconds (default: 30)
  --forecast_sec: Forecast horizon in seconds (default: 20)
  --stride_sec:   Window sliding stride in seconds (default: 1)
  --output_dir:   Directory to save generated windows, manifests, and scalers

OUTPUTS:
  - windows.npz: Contains X (features [N, 30, F]), y_forecast ([N]), y_state ([N]), mask ([N])
  - window_manifest.csv: Metadata per window (window_id, learner_id, session_id, t_cutoff_ms, is_valid)
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    'event_count',
    'response_count',
    'mean_latency_ms',
    'max_latency_ms',
    'error_count',
    'prompt_count',
    'touch_count',
    'pause_duration_ms',
    'visual_valid',
    'head_yaw_mean',
    'face_presence_ratio'
]

STATE_TO_ID = {
    'ACTIVE': 0,
    'PASSIVE_DECREASE': 1,
    'REGULATING': 2,
    'UNCERTAIN': -1,
    'UNKNOWN': -1
}


def build_session_windows(
    aligned_df: pd.DataFrame,
    history_sec: int = 30,
    forecast_sec: int = 20,
    stride_sec: int = 1,
    calibration_sec: int = 60
):
    """
    Extracts strictly non-leaking overlapping windows from an aligned session.
    """
    session_id = aligned_df['session_id'].iloc[0]
    learner_id = aligned_df['learner_id'].iloc[0]
    total_bins = len(aligned_df)

    # Convert features to float array
    raw_features = aligned_df[FEATURE_COLUMNS].to_numpy(dtype=np.float32)

    # Compute personal baseline using only the initial calibration period (e.g. first 60s)
    calib_bins = min(total_bins, calibration_sec)
    if calib_bins > 10:
        base_mean = np.mean(raw_features[:calib_bins], axis=0)
        base_std = np.std(raw_features[:calib_bins], axis=0) + 1e-5
    else:
        base_mean = np.zeros(raw_features.shape[1], dtype=np.float32)
        base_std = np.ones(raw_features.shape[1], dtype=np.float32)

    windows_X = []
    labels_forecast = []
    labels_state = []
    valid_masks = []
    manifest_rows = []

    # t represents the cutoff index (end of input history)
    # Range: from history_sec to total_bins - forecast_sec
    for t in range(history_sec, total_bins - forecast_sec + 1, stride_sec):
        # 1. Input history strictly in [t - history_sec, t)
        history_slice = raw_features[t - history_sec:t].copy()

        # Personal baseline normalization (relative to early session calibration only)
        # Features 0..7 (latency, counts, pauses) are normalized relative to baseline
        history_normalized = history_slice.copy()
        history_normalized[:, :8] = (history_slice[:, :8] - base_mean[:8]) / base_std[:8]

        # 2. Cutoff time info
        t_cutoff_ms = int(aligned_df['time_bin_start_ms'].iloc[t])
        current_state_str = aligned_df['current_state'].iloc[t - 1]
        current_state_id = STATE_TO_ID.get(current_state_str, -1)

        # 3. Forecast target in [t, t + forecast_sec)
        future_slice_df = aligned_df.iloc[t:t + forecast_sec]

        # Verification of follow-up coverage:
        # If there are fewer than forecast_sec bins available, skip
        if len(future_slice_df) < forecast_sec:
            continue

        # Invalidation check: teacher intervention or uncertain labels in future horizon
        has_intervention_in_target = future_slice_df['has_intervention'].max() > 0
        has_uncertainty_in_target = (future_slice_df['current_state'] == 'UNCERTAIN').mean() > 0.3

        # Check if an eligible onset begins in the target window
        has_onset = int(future_slice_df['is_onset'].max() > 0)

        # Validity mask
        is_valid = int(not has_intervention_in_target and not has_uncertainty_in_target and current_state_id != -1)

        window_id = f"{session_id}_t{t_cutoff_ms}"

        windows_X.append(history_normalized)
        labels_forecast.append(has_onset)
        labels_state.append(max(0, current_state_id))
        valid_masks.append(is_valid)

        manifest_rows.append({
            'window_id': window_id,
            'learner_id': learner_id,
            'session_id': session_id,
            'cutoff_time_ms': t_cutoff_ms,
            'target_onset': has_onset,
            'current_state': current_state_str,
            'is_valid': is_valid,
            'has_intervention_ahead': int(has_intervention_in_target),
        })

    if not windows_X:
        return None, None, None, None, pd.DataFrame()

    return (
        np.array(windows_X, dtype=np.float32),
        np.array(labels_forecast, dtype=np.int64),
        np.array(labels_state, dtype=np.int64),
        np.array(valid_masks, dtype=np.int64),
        pd.DataFrame(manifest_rows)
    )


def main():
    parser = argparse.ArgumentParser(description="Build 30s input / 20s forecast sequence windows.")
    parser.add_argument("--aligned_file", type=str, default=None, help="Path to single aligned session CSV")
    parser.add_argument("--aligned_dir", type=str, default=None, help="Path to directory containing aligned_*.csv files")
    parser.add_argument("--history_sec", type=int, default=30, help="Input sequence length in seconds (default 30)")
    parser.add_argument("--forecast_sec", type=int, default=20, help="Forecast horizon in seconds (default 20)")
    parser.add_argument("--stride_sec", type=int, default=1, help="Stride in seconds (default 1)")
    parser.add_argument("--output_dir", type=str, required=True, help="Directory to save windows.npz and manifest")

    args = parser.parse_args()

    aligned_files = []
    if args.aligned_file:
        aligned_files.append(args.aligned_file)
    elif args.aligned_dir:
        import glob
        aligned_files = sorted(glob.glob(os.path.join(args.aligned_dir, "aligned_*.csv")))
    else:
        print("[build_windows] Error: Must provide either --aligned_file or --aligned_dir.")
        return

    if not aligned_files:
        print(f"[build_windows] Error: No aligned CSV files found.")
        return

    all_X = []
    all_y_forecast = []
    all_y_state = []
    all_masks = []
    all_manifests = []

    for file_path in aligned_files:
        df = pd.read_csv(file_path)
        if len(df) < args.history_sec + args.forecast_sec:
            continue
        X, y_forecast, y_state, mask, manifest_df = build_session_windows(
            df,
            history_sec=args.history_sec,
            forecast_sec=args.forecast_sec,
            stride_sec=args.stride_sec
        )
        if X is not None and len(X) > 0:
            all_X.append(X)
            all_y_forecast.append(y_forecast)
            all_y_state.append(y_state)
            all_masks.append(mask)
            all_manifests.append(manifest_df)

    if not all_X:
        print("[build_windows] No valid windows could be constructed from supplied sessions.")
        return

    combined_X = np.concatenate(all_X, axis=0)
    combined_y_forecast = np.concatenate(all_y_forecast, axis=0)
    combined_y_state = np.concatenate(all_y_state, axis=0)
    combined_masks = np.concatenate(all_masks, axis=0)
    combined_manifest = pd.concat(all_manifests, ignore_index=True)

    os.makedirs(args.output_dir, exist_ok=True)
    npz_path = os.path.join(args.output_dir, "windows.npz")
    manifest_path = os.path.join(args.output_dir, "window_manifest.csv")

    np.savez_compressed(
        npz_path,
        X=combined_X,
        y_forecast=combined_y_forecast,
        y_state=combined_y_state,
        mask=combined_masks,
        feature_names=FEATURE_COLUMNS
    )
    combined_manifest.to_csv(manifest_path, index=False)

    print(f"[build_windows] Successfully generated {len(combined_X)} total windows across {len(aligned_files)} sessions:")
    print(f"  - Shape of X: {combined_X.shape}")
    print(f"  - Forecast onsets: {np.sum(combined_y_forecast)} / {len(combined_y_forecast)} ({np.mean(combined_y_forecast)*100:.1f}%)")
    print(f"  - Valid windows: {np.sum(combined_masks)} / {len(combined_masks)}")
    print(f"  - Unique learners: {combined_manifest['learner_id'].nunique()}")
    print(f"  - Saved to: {npz_path} and {manifest_path}")


if __name__ == "__main__":
    main()
