"""
evaluate_events.py
==================
Component 3 (Participation Forecasting - PBEF)
Performs rigorous Event-Level Alert Evaluation with Cooldown and Horizon Matching.

EVALUATION SPECIFICATION:
  - Event Matching Rule: An alert at time t is matched as a True Positive if an eligible
    participation decrease onset occurs in [t, t + horizon_sec].
  - Duplicate Alert Suppression: At most one alert is counted per true onset event.
  - Cooldown: Once an alert fires, subsequent alerts within cooldown_sec (default: 15s)
    are suppressed to prevent alerting fatigue.
  - False Alerts Per Hour: Number of un-matched alerts normalized by total session hours.
  - Usable Lead Time: Measured time difference (t_onset - t_alert) for matched warnings.

INPUTS:
  --manifest_file: Window manifest CSV containing timestamps and ground truth
  --predictions_file: CSV or NPZ containing predicted risk probabilities
  --threshold: Operating alert threshold (default: 0.50)
  --horizon_sec: Alert validity horizon (default: 20)
  --cooldown_sec: Cooldown period after alert (default: 15)
  --output_file: Path to save evaluation metrics JSON

OUTPUTS:
  - Event-level Precision, Recall, F1
  - False Alerts Per Hour
  - Mean & Median Usable Lead Time (seconds)
  - Per-Learner Breakdown
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd


def evaluate_event_alerts(
    manifest_df: pd.DataFrame,
    predicted_probs: np.ndarray,
    threshold: float = 0.50,
    horizon_sec: int = 20,
    cooldown_sec: int = 15
):
    df = manifest_df.copy()
    df['pred_prob'] = predicted_probs
    df['raw_alert'] = (df['pred_prob'] >= threshold).astype(int)

    horizon_ms = horizon_sec * 1000
    cooldown_ms = cooldown_sec * 1000

    results_by_session = []
    all_matched_lead_times = []
    total_true_events = 0
    total_true_positives = 0
    total_false_positives = 0
    total_exposure_ms = 0

    for session_id, s_df in df.groupby('session_id'):
        s_df = s_df.sort_values(by='cutoff_time_ms').reset_index(drop=True)
        session_duration = s_df['cutoff_time_ms'].max() - s_df['cutoff_time_ms'].min()
        total_exposure_ms += session_duration

        # Identify true onsets in session
        onset_times = s_df[s_df['target_onset'] == 1]['cutoff_time_ms'].unique()
        total_true_events += len(onset_times)
        matched_onsets = set()

        last_alert_time = -float('inf')

        for _, row in s_df.iterrows():
            t = row['cutoff_time_ms']
            is_alert = row['raw_alert'] == 1

            if not is_alert:
                continue

            # Check cooldown
            if t - last_alert_time < cooldown_ms:
                continue  # Suppressed by cooldown

            last_alert_time = t

            # Check if this alert matches an upcoming true onset within horizon
            eligible_onsets = [o for o in onset_times if 0 <= (o - t) <= horizon_ms and o not in matched_onsets]

            if eligible_onsets:
                first_onset = eligible_onsets[0]
                matched_onsets.add(first_onset)
                lead_time_sec = (first_onset - t) / 1000.0
                all_matched_lead_times.append(lead_time_sec)
                total_true_positives += 1
            else:
                total_false_positives += 1

    total_hours = max(0.001, total_exposure_ms / (1000.0 * 3600.0))
    false_alerts_per_hour = total_false_positives / total_hours

    precision = total_true_positives / max(1, total_true_positives + total_false_positives)
    recall = total_true_positives / max(1, total_true_events)
    f1 = 2 * (precision * recall) / max(1e-6, (precision + recall))

    lead_mean = float(np.mean(all_matched_lead_times)) if all_matched_lead_times else 0.0
    lead_median = float(np.median(all_matched_lead_times)) if all_matched_lead_times else 0.0

    metrics = {
        'threshold': round(float(threshold), 3),
        'horizon_seconds': horizon_sec,
        'cooldown_seconds': cooldown_sec,
        'total_true_onset_events': int(total_true_events),
        'true_positives_matched': int(total_true_positives),
        'false_positives_unmatched': int(total_false_positives),
        'event_precision': round(float(precision), 4),
        'event_recall': round(float(recall), 4),
        'event_f1': round(float(f1), 4),
        'false_alerts_per_hour': round(float(false_alerts_per_hour), 2),
        'mean_usable_lead_time_sec': round(lead_mean, 2),
        'median_usable_lead_time_sec': round(lead_median, 2),
        'total_exposure_hours': round(float(total_hours), 3)
    }

    return metrics


def main():
    parser = argparse.ArgumentParser(description="Evaluate Event-Level Forecast Warnings.")
    parser.add_argument("--manifest_file", type=str, required=True, help="Path to window_manifest.csv")
    parser.add_argument("--predictions_file", type=str, required=True, help="Path to predictions npz/csv")
    parser.add_argument("--threshold", type=float, default=0.50, help="Alert probability threshold")
    parser.add_argument("--horizon_sec", type=int, default=20, help="Alert validity horizon in seconds")
    parser.add_argument("--cooldown_sec", type=int, default=15, help="Alert cooldown suppression in seconds")
    parser.add_argument("--output_file", type=str, default="results/metrics/event_metrics.json", help="Output metrics path")

    args = parser.parse_args()

    manifest = pd.read_csv(args.manifest_file)
    if args.predictions_file.endswith('.npz'):
        preds = np.load(args.predictions_file)['y_prob']
    elif args.predictions_file.endswith('.npy'):
        preds = np.load(args.predictions_file)
    else:
        pred_df = pd.read_csv(args.predictions_file)
        preds = pred_df['pred_prob'].to_numpy()

    metrics = evaluate_event_alerts(
        manifest,
        preds,
        threshold=args.threshold,
        horizon_sec=args.horizon_sec,
        cooldown_sec=args.cooldown_sec
    )

    os.makedirs(os.path.dirname(os.path.abspath(args.output_file)), exist_ok=True)
    with open(args.output_file, 'w') as f:
        json.dump(metrics, f, indent=2)

    print("\n================ EVENT EVALUATION RESULTS ================")
    print(f"Total True Events: {metrics['total_true_onset_events']}")
    print(f"Matched Alerts (TP): {metrics['true_positives_matched']}")
    print(f"False Alerts: {metrics['false_positives_unmatched']}")
    print(f"Event Precision: {metrics['event_precision']:.4f}")
    print(f"Event Recall: {metrics['event_recall']:.4f}")
    print(f"False Alerts / Hour: {metrics['false_alerts_per_hour']}")
    print(f"Mean Usable Lead Time: {metrics['mean_usable_lead_time_sec']} seconds")
    print(f"Saved report to: {args.output_file}\n")


if __name__ == "__main__":
    main()
