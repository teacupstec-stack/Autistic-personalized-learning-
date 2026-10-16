"""
train_logistic.py
=================
Component 3 (Participation Forecasting - PBEF)
Trains a transparent summary-statistic Baseline Model and Threshold Rule
to establish performance benchmarks prior to temporal neural forecasting.

SUMMARY FEATURES EXTRACTED FROM 30-SECOND WINDOW:
  1. Mean response latency
  2. Max response latency
  3. Latency trend / slope over 30s
  4. Total pause duration (idle time)
  5. Touch frequency (touches / 30s)
  6. Total prompt count
  7. Error count & accuracy rate

INPUTS:
  --data_file: Path to windows.npz (from build_windows.py)
  --manifest_file: Path to window_manifest.csv
  --output_dir: Directory to save baseline models and metrics (default: models/baseline)

OUTPUTS:
  - baseline_logistic.pkl: Trained LogisticRegression model and StandardScaler
  - baseline_rules.json: Learned heuristic threshold decision boundaries
  - baseline_metrics.json: PR-AUC, ROC-AUC, F1, Precision, Recall, False Alert rate
"""

import os
import sys
import json
import argparse
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    confusion_matrix
)


def extract_summary_features(X_windows: np.ndarray) -> np.ndarray:
    """
    Collapses [N, 30, F] temporal sequence into [N, S] aggregate summary vector:
      - mean, max, std, and slope of latency (feat 2)
      - total pause duration (feat 7 sum)
      - total touches (feat 6 sum)
      - total prompts (feat 5 max)
      - total errors (feat 4 sum)
      - total events (feat 0 sum)
    """
    N, T, F = X_windows.shape
    summaries = []

    # Time indices for linear slope calculation
    t_steps = np.arange(T, dtype=np.float32)

    for i in range(N):
        window = X_windows[i]  # [30, F]

        latencies = window[:, 2] # mean_latency_ms
        mean_lat = np.mean(latencies)
        max_lat = np.max(latencies)
        std_lat = np.std(latencies)

        # Approximate latency acceleration / slope
        slope_lat = np.polyfit(t_steps, latencies, 1)[0] if T > 1 else 0.0

        total_pause = np.sum(window[:, 7])
        total_touches = np.sum(window[:, 6])
        max_prompts = np.max(window[:, 5])
        total_errors = np.sum(window[:, 4])
        total_events = np.sum(window[:, 0])

        summaries.append([
            mean_lat,
            max_lat,
            std_lat,
            slope_lat,
            total_pause,
            total_touches,
            max_prompts,
            total_errors,
            total_events
        ])

    return np.array(summaries, dtype=np.float32)


def evaluate_predictions(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5):
    """Calculates PR-AUC, ROC-AUC, Precision, Recall, F1, and Confusion Matrix."""
    y_pred = (y_prob >= threshold).astype(int)

    pr_auc = average_precision_score(y_true, y_prob) if len(np.unique(y_true)) > 1 else 0.0
    roc_auc = roc_auc_score(y_true, y_prob) if len(np.unique(y_true)) > 1 else 0.5
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred).tolist() if len(np.unique(y_true)) > 1 else []

    return {
        'threshold': round(float(threshold), 3),
        'pr_auc': round(float(pr_auc), 4),
        'roc_auc': round(float(roc_auc), 4),
        'precision': round(float(prec), 4),
        'recall': round(float(rec), 4),
        'f1_score': round(float(f1), 4),
        'confusion_matrix': cm
    }


def fit_threshold_baseline(X_summary: np.ndarray, y: np.ndarray):
    """
    Fits a simple explainable rule baseline:
    Predicts onset if (mean_latency > T_lat) OR (pause_duration > T_pause).
    """
    best_f1 = -1.0
    best_thresholds = {}

    latencies = X_summary[:, 0]
    pauses = X_summary[:, 4]

    for lat_p in [50, 70, 85, 90]:
        t_lat = np.percentile(latencies, lat_p)
        for pause_p in [50, 70, 85, 90]:
            t_pause = np.percentile(pauses, pause_p)
            rule_pred = ((latencies > t_lat) | (pauses > t_pause)).astype(int)
            score = f1_score(y, rule_pred, zero_division=0)

            if score > best_f1:
                best_f1 = score
                best_thresholds = {
                    'latency_threshold': float(t_lat),
                    'pause_threshold': float(t_pause),
                    'f1': float(score),
                    'precision': float(precision_score(y, rule_pred, zero_division=0)),
                    'recall': float(recall_score(y, rule_pred, zero_division=0))
                }

    return best_thresholds


def main():
    parser = argparse.ArgumentParser(description="Train Baseline Logistic Regression & Threshold Rule.")
    parser.add_argument("--data_file", type=str, required=True, help="Path to windows.npz")
    parser.add_argument("--manifest_file", type=str, required=True, help="Path to window_manifest.csv")
    parser.add_argument("--output_dir", type=str, default="models/baseline", help="Directory to save models")

    args = parser.parse_args()

    # Load data
    npz = np.load(args.data_file)
    X = npz['X']
    y_forecast = npz['y_forecast']
    mask = npz['mask']

    manifest = pd.read_csv(args.manifest_file)

    # Filter to valid windows
    valid_idx = np.where(mask == 1)[0]
    X_valid = X[valid_idx]
    y_valid = y_forecast[valid_idx]
    manifest_valid = manifest.iloc[valid_idx].reset_index(drop=True)

    if len(X_valid) == 0:
        print("[train_logistic] Error: No valid windows found.")
        return

    # Extract summary features
    X_summary = extract_summary_features(X_valid)

    # Participant-level split: Group by learner_id (or session_id)
    unique_learners = manifest_valid['learner_id'].unique()
    np.random.seed(42)
    shuffled_learners = np.random.permutation(unique_learners)

    split_pt = max(1, int(len(shuffled_learners) * 0.75))
    train_learners = set(shuffled_learners[:split_pt])
    test_learners = set(shuffled_learners[split_pt:])

    # If single learner, fallback to session-level split
    if len(unique_learners) <= 1:
        unique_sessions = manifest_valid['session_id'].unique()
        split_pt = max(1, int(len(unique_sessions) * 0.75))
        train_sessions = set(unique_sessions[:split_pt])
        train_mask = manifest_valid['session_id'].isin(train_sessions).to_numpy()
    else:
        train_mask = manifest_valid['learner_id'].isin(train_learners).to_numpy()

    test_mask = ~train_mask

    if np.sum(test_mask) == 0:
        # Fallback to temporal split within session
        n_train = int(len(X_summary) * 0.75)
        train_mask = np.zeros(len(X_summary), dtype=bool)
        train_mask[:n_train] = True
        test_mask = ~train_mask

    X_train, y_train = X_summary[train_mask], y_valid[train_mask]
    X_test, y_test = X_summary[test_mask], y_valid[test_mask]

    # Preprocessing
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Calculate class balance weight
    pos_count = np.sum(y_train == 1)
    neg_count = np.sum(y_train == 0)
    class_weight = 'balanced' if pos_count > 0 and neg_count > 0 else None

    # Fit Logistic Regression
    clf = LogisticRegression(class_weight=class_weight, max_iter=1000, random_state=42)
    clf.fit(X_train_scaled, y_train)

    # Evaluate Logistic
    y_test_prob = clf.predict_proba(X_test_scaled)[:, 1] if len(clf.classes_) > 1 else np.zeros(len(y_test))
    logistic_metrics = evaluate_predictions(y_test, y_test_prob, threshold=0.5)

    # Fit Threshold Rule Baseline
    threshold_rules = fit_threshold_baseline(X_train, y_train)

    os.makedirs(args.output_dir, exist_ok=True)
    joblib.dump({'model': clf, 'scaler': scaler}, os.path.join(args.output_dir, "baseline_logistic.pkl"))

    with open(os.path.join(args.output_dir, "baseline_rules.json"), 'w') as f:
        json.dump(threshold_rules, f, indent=2)

    with open(os.path.join(args.output_dir, "baseline_metrics.json"), 'w') as f:
        json.dump(logistic_metrics, f, indent=2)

    print("\n================ BASELINE RESULTS ================")
    print(f"Dataset Size: Train={len(X_train)}, Test={len(X_test)}")
    print(f"Class Prevalence: Train Positive = {np.mean(y_train)*100:.1f}%, Test Positive = {np.mean(y_test)*100:.1f}%")
    print(f"Threshold Rule Baseline F1: {threshold_rules.get('f1', 0):.4f}")
    print(f"Logistic Regression PR-AUC: {logistic_metrics['pr_auc']:.4f}")
    print(f"Logistic Regression ROC-AUC: {logistic_metrics['roc_auc']:.4f}")
    print(f"Logistic Regression F1: {logistic_metrics['f1_score']:.4f}")
    print(f"Artifacts saved to {args.output_dir}\n")


if __name__ == "__main__":
    main()
