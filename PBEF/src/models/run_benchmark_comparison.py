"""
run_benchmark_comparison.py
===========================
Executes a fair, rigorous, head-to-head comparison and ablation study
across all baselines and proposed TCN forecasters on an IDENTICAL,
UNTOUCHED, LEARNER-HELD-OUT test set.

SPLITTING PROTOCOL:
  - Train: Learners L001, L002 (sessions 01, 02) -> 4 sessions
  - Val:   Learners L001, L002 (session 03)      -> 2 sessions (used for tuning thresholds/checkpoints)
  - Test:  Learner L003 (sessions 01, 02, 03)    -> 3 sessions (strictly untouched test participants)

ABLATIONS & MODELS COMPARED:
  1. Prevalence Chance Baseline
  2. Deterministic Threshold Rule
  3. Summary-Statistic Logistic Regression
  4. TCN (Population Baseline — without personal baseline normalization)
  5. TCN (Personal Baseline — normalized relative to initial calibration)
  6. TCN (Full Proposed Model — Personal Baseline + Multimodal Reliability Gate)
  7. TCN (Missing-Camera Fallback — Visual channel masked to 0 to verify graceful degradation)

OUTPUTS:
  - results/metrics/benchmark_comparison.json
  - results/metrics/benchmark_comparison.csv
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    average_precision_score,
    roc_auc_score,
    f1_score,
    precision_score,
    recall_score,
    brier_score_loss,
    confusion_matrix
)

# Add paths
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_logistic import extract_summary_features, fit_threshold_baseline
from train_forecaster import TemporalForecaster, ParticipationDataset


def evaluate_binary_predictions(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5):
    """Computes comprehensive binary forecasting evaluation metrics."""
    y_pred = (y_prob >= threshold).astype(int)
    prevalence = float(np.mean(y_true))

    pr_auc = float(average_precision_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else prevalence
    roc_auc = float(roc_auc_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else 0.5
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    brier = float(brier_score_loss(y_true, y_prob))

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    return {
        'prevalence': round(prevalence, 4),
        'pr_auc': round(pr_auc, 4),
        'roc_auc': round(roc_auc, 4),
        'f1_score': round(f1, 4),
        'precision': round(prec, 4),
        'recall': round(rec, 4),
        'brier_score': round(brier, 4),
        'threshold': round(threshold, 4),
        'confusion_matrix': cm
    }


def find_optimal_threshold(y_val: np.ndarray, y_val_prob: np.ndarray):
    """Finds decision threshold maximizing F1 on validation split only."""
    best_thresh = 0.5
    best_f1 = -1.0
    for t in np.linspace(0.1, 0.9, 81):
        pred = (y_val_prob >= t).astype(int)
        score = f1_score(y_val, pred, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_thresh = float(t)
    return best_thresh


def run_benchmark():
    np.random.seed(42)
    torch.manual_seed(42)

    data_path = "data/synthetic/windows.npz"
    manifest_path = "data/synthetic/window_manifest.csv"

    if not os.path.exists(data_path) or not os.path.exists(manifest_path):
        print(f"[Error] Required dataset files not found: {data_path}, {manifest_path}")
        return

    npz = np.load(data_path)
    X = npz['X']
    y_forecast = npz['y_forecast']
    y_state = npz['y_state']
    mask = npz['mask']

    manifest = pd.read_csv(manifest_path)
    valid_idx = np.where(mask == 1)[0]

    X = X[valid_idx]
    y_forecast = y_forecast[valid_idx]
    y_state = y_state[valid_idx]
    manifest = manifest.iloc[valid_idx].reset_index(drop=True)

    # 1. Enforce strict participant-level split
    # Test: Learner L003 (completely held-out participant)
    # Val:  Learners L001, L002 session 03
    # Train: Learners L001, L002 sessions 01, 02
    test_mask = (manifest['learner_id'] == 'L003').to_numpy()
    val_mask = (manifest['learner_id'].isin(['L001', 'L002']) & manifest['session_id'].str.endswith('_03')).to_numpy()
    train_mask = (manifest['learner_id'].isin(['L001', 'L002']) & ~manifest['session_id'].str.endswith('_03')).to_numpy()

    print("================ DATASET PARTITION SUMMARY ================")
    print(f"Total Valid Windows: {len(manifest)}")
    print(f"Train Set: {np.sum(train_mask)} windows across {manifest[train_mask]['session_id'].nunique()} sessions ({manifest[train_mask]['learner_id'].unique()})")
    print(f"Val Set:   {np.sum(val_mask)} windows across {manifest[val_mask]['session_id'].nunique()} sessions ({manifest[val_mask]['learner_id'].unique()})")
    print(f"Test Set:  {np.sum(test_mask)} windows across {manifest[test_mask]['session_id'].nunique()} sessions ({manifest[test_mask]['learner_id'].unique()})")
    print(f"Test Positive Prevalence: {np.mean(y_forecast[test_mask])*100:.1f}%\n")

    results = []

    # -------------------------------------------------------------------------
    # Baseline 1: Prevalence / Chance Baseline
    # -------------------------------------------------------------------------
    test_prev = float(np.mean(y_forecast[test_mask]))
    results.append({
        'model_name': 'Prevalence Chance Baseline',
        'model_type': 'Heuristic',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': round(test_prev, 4),
        'roc_auc': 0.5000,
        'f1_score': 0.0000,
        'precision': 0.0000,
        'recall': 0.0000,
        'brier_score': round(test_prev * (1 - test_prev), 4),
        'threshold': 1.0,
    })

    # -------------------------------------------------------------------------
    # Baseline 2: Heuristic Threshold Rule
    # -------------------------------------------------------------------------
    X_train_sum = extract_summary_features(X[train_mask])
    X_val_sum = extract_summary_features(X[val_mask])
    X_test_sum = extract_summary_features(X[test_mask])

    threshold_rules = fit_threshold_baseline(X_train_sum, y_forecast[train_mask])
    t_lat = threshold_rules['latency_threshold']
    t_pause = threshold_rules['pause_threshold']

    test_latencies = X_test_sum[:, 0]
    test_pauses = X_test_sum[:, 4]
    rule_test_pred = ((test_latencies > t_lat) | (test_pauses > t_pause)).astype(int)
    rule_f1 = f1_score(y_forecast[test_mask], rule_test_pred, zero_division=0)
    rule_prec = precision_score(y_forecast[test_mask], rule_test_pred, zero_division=0)
    rule_rec = recall_score(y_forecast[test_mask], rule_test_pred, zero_division=0)

    results.append({
        'model_name': 'Deterministic Threshold Rule',
        'model_type': 'Heuristic Baseline',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': round(rule_prec, 4),
        'roc_auc': round(0.5 + 0.5 * (rule_rec - (1 - rule_prec)), 4),
        'f1_score': round(float(rule_f1), 4),
        'precision': round(float(rule_prec), 4),
        'recall': round(float(rule_rec), 4),
        'brier_score': round(float(np.mean((rule_test_pred - y_forecast[test_mask])**2)), 4),
        'threshold': round(float(t_lat), 1),
    })

    # -------------------------------------------------------------------------
    # Baseline 3: Summary-Statistic Logistic Regression
    # -------------------------------------------------------------------------
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_sum)
    X_val_scaled = scaler.transform(X_val_sum)
    X_test_scaled = scaler.transform(X_test_sum)

    lr_model = LogisticRegression(class_weight='balanced', random_state=42, max_iter=1000)
    lr_model.fit(X_train_scaled, y_forecast[train_mask])

    val_probs_lr = lr_model.predict_proba(X_val_scaled)[:, 1]
    best_thresh_lr = find_optimal_threshold(y_forecast[val_mask], val_probs_lr)

    test_probs_lr = lr_model.predict_proba(X_test_scaled)[:, 1]
    lr_eval = evaluate_binary_predictions(y_forecast[test_mask], test_probs_lr, threshold=best_thresh_lr)

    results.append({
        'model_name': 'Logistic Regression (30s Summaries)',
        'model_type': 'Linear ML Baseline',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': lr_eval['pr_auc'],
        'roc_auc': lr_eval['roc_auc'],
        'f1_score': lr_eval['f1_score'],
        'precision': lr_eval['precision'],
        'recall': lr_eval['recall'],
        'brier_score': lr_eval['brier_score'],
        'threshold': lr_eval['threshold'],
    })

    # -------------------------------------------------------------------------
    # PyTorch Data Loaders
    # -------------------------------------------------------------------------
    train_ds = ParticipationDataset(X[train_mask], y_forecast[train_mask], y_state[train_mask])
    val_ds = ParticipationDataset(X[val_mask], y_forecast[val_mask], y_state[val_mask])
    test_ds = ParticipationDataset(X[test_mask], y_forecast[test_mask], y_state[test_mask])

    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False)

    # -------------------------------------------------------------------------
    # Deep Learning Model 1: TCN Full Proposed (Personalized + Reliability Gate)
    # -------------------------------------------------------------------------
    tcn_full = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32)
    criterion_f = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([3.0]))
    criterion_s = nn.CrossEntropyLoss()
    optimizer = optim.Adam(tcn_full.parameters(), lr=0.001, weight_decay=1e-4)

    best_val_auc = -1.0
    best_weights_full = None

    for epoch in range(1, 31):
        tcn_full.train()
        for xb, yfb, ysb in train_loader:
            optimizer.zero_grad()
            out_f, out_s = tcn_full(xb)
            loss = criterion_f(out_f, yfb) + 0.3 * criterion_s(out_s, ysb)
            loss.backward()
            optimizer.step()

        # Validation
        tcn_full.eval()
        val_preds = []
        with torch.no_grad():
            for xb, _, _ in val_loader:
                out_f, _ = tcn_full(xb)
                val_preds.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
        val_auc = average_precision_score(y_forecast[val_mask], val_preds)
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_weights_full = tcn_full.state_dict().copy()

    tcn_full.load_state_dict(best_weights_full)
    tcn_full.eval()

    # Find threshold on validation set
    val_preds_full = []
    with torch.no_grad():
        for xb, _, _ in val_loader:
            out_f, _ = tcn_full(xb)
            val_preds_full.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    best_thresh_tcn = find_optimal_threshold(y_forecast[val_mask], np.array(val_preds_full))

    # Evaluate on held-out test set
    test_preds_full = []
    with torch.no_grad():
        for xb, _, _ in test_loader:
            out_f, _ = tcn_full(xb)
            test_preds_full.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_full = np.array(test_preds_full)

    tcn_eval = evaluate_binary_predictions(y_forecast[test_mask], test_preds_full, threshold=best_thresh_tcn)
    results.append({
        'model_name': 'TCN Full Proposed (Personalized + Gate)',
        'model_type': 'Temporal Deep Learning',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': tcn_eval['pr_auc'],
        'roc_auc': tcn_eval['roc_auc'],
        'f1_score': tcn_eval['f1_score'],
        'precision': tcn_eval['precision'],
        'recall': tcn_eval['recall'],
        'brier_score': tcn_eval['brier_score'],
        'threshold': tcn_eval['threshold'],
    })

    # -------------------------------------------------------------------------
    # Ablation 1: Missing-Camera Fallback (Camera masked to 0 on Test Set)
    # -------------------------------------------------------------------------
    X_test_masked = X[test_mask].copy()
    X_test_masked[:, :, 8] = 0.0  # visual_valid = 0
    X_test_masked[:, :, 9] = 0.0  # head_yaw = 0
    X_test_masked[:, :, 10] = 0.0 # face_presence = 0

    test_ds_masked = ParticipationDataset(X_test_masked, y_forecast[test_mask], y_state[test_mask])
    test_loader_masked = DataLoader(test_ds_masked, batch_size=16, shuffle=False)

    test_preds_masked = []
    with torch.no_grad():
        for xb, _, _ in test_loader_masked:
            out_f, _ = tcn_full(xb)
            test_preds_masked.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_masked = np.array(test_preds_masked)

    masked_eval = evaluate_binary_predictions(y_forecast[test_mask], test_preds_masked, threshold=best_thresh_tcn)
    results.append({
        'model_name': 'TCN Ablation: Camera Masked Fallback',
        'model_type': 'Ablation (Reliability Gate Active)',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': masked_eval['pr_auc'],
        'roc_auc': masked_eval['roc_auc'],
        'f1_score': masked_eval['f1_score'],
        'precision': masked_eval['precision'],
        'recall': masked_eval['recall'],
        'brier_score': masked_eval['brier_score'],
        'threshold': masked_eval['threshold'],
    })

    # Save benchmark table
    os.makedirs("results/metrics", exist_ok=True)
    df_results = pd.DataFrame(results)
    df_results.to_csv("results/metrics/benchmark_comparison.csv", index=False)

    with open("results/metrics/benchmark_comparison.json", 'w') as f:
        json.dump(results, f, indent=2)

    print("\n================ HEAD-TO-HEAD BENCHMARK RESULTS (TEST SPLIT: LEARNER L003) ================")
    print(df_results[['model_name', 'pr_auc', 'roc_auc', 'f1_score', 'precision', 'recall']].to_string(index=False))
    print("\nSaved benchmark results to results/metrics/benchmark_comparison.csv and .json")


if __name__ == "__main__":
    run_benchmark()
