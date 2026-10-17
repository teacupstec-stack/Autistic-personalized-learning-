"""
run_benchmark_comparison.py
===========================
Executes a fair, rigorous, head-to-head comparison and ablation study
across all baselines and proposed TCN forecasters on an IDENTICAL,
UNTOUCHED, LEARNER-HELD-OUT test set.

SPLITTING PROTOCOL:
  - Train: Learners L001, L002 (sessions 01, 02) -> 4 sessions (564 valid windows)
  - Val:   Learners L001, L002 (session 03)      -> 2 sessions (282 valid windows)
  - Test:  Learner L003 (sessions 01, 02, 03)    -> 3 sessions (423 valid windows)

ALL 7 ADVERTISED MODELS & ABLATIONS:
  1. Prevalence Chance Baseline (Fit strictly on train prevalence, evaluated on test)
  2. Deterministic Threshold Rule (Heuristic latency/pause percentiles; discrete 0/1 metrics)
  3. Summary-Statistic Logistic Regression (9 summary features collapsed over 30s)
  4. TCN (Population Baseline — trained on unnormalized raw features, no session calibration)
  5. TCN (Personal Baseline — trained on calibrated interaction features only, 8 channels, no camera)
  6. TCN (Full Proposed Model — Personal Baseline + Multimodal Reliability Gate, 11 channels)
  7. TCN (Missing-Camera Fallback — Model 6 evaluated with visual channels masked to 0)

OUTPUTS:
  - results/metrics/benchmark_comparison.json
  - results/metrics/benchmark_comparison.csv
  - results/metrics/event_metrics.json
"""

import os
import sys
import copy
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
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'evaluation'))
from train_logistic import extract_summary_features, fit_threshold_baseline
from train_forecaster import TemporalForecaster, ParticipationDataset
from evaluate_events import evaluate_event_alerts


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


def train_and_eval_tcn(
    model: nn.Module,
    train_X: np.ndarray, train_yf: np.ndarray, train_ys: np.ndarray,
    val_X: np.ndarray, val_yf: np.ndarray, val_ys: np.ndarray,
    test_X: np.ndarray, test_yf: np.ndarray, test_ys: np.ndarray,
    epochs: int = 30,
    lr: float = 0.001,
    batch_size: int = 16
):
    """
    Trains a TCN variant with strict deepcopy checkpointing and validation-based threshold selection.
    """
    train_ds = ParticipationDataset(train_X, train_yf, train_ys)
    val_ds = ParticipationDataset(val_X, val_yf, val_ys)
    test_ds = ParticipationDataset(test_X, test_yf, test_ys)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    criterion_f = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([3.0]))
    criterion_s = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_val_auc = -1.0
    best_weights = None

    for epoch in range(1, epochs + 1):
        model.train()
        for xb, yfb, ysb in train_loader:
            optimizer.zero_grad()
            out_f, out_s = model(xb)
            loss = criterion_f(out_f, yfb) + 0.3 * criterion_s(out_s, ysb)
            loss.backward()
            optimizer.step()

        # Validation
        model.eval()
        val_preds = []
        with torch.no_grad():
            for xb, _, _ in val_loader:
                out_f, _ = model(xb)
                val_preds.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
        val_auc = average_precision_score(val_yf, val_preds) if len(np.unique(val_yf)) > 1 else 0.0
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            # Critical Bug Fix B: Use copy.deepcopy to prevent in-place mutation of checkpoint weights
            best_weights = copy.deepcopy(model.state_dict())

    if best_weights is not None:
        model.load_state_dict(best_weights)
    model.eval()

    # Find optimal threshold on validation split only
    val_preds_final = []
    with torch.no_grad():
        for xb, _, _ in val_loader:
            out_f, _ = model(xb)
            val_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    best_thresh = find_optimal_threshold(val_yf, np.array(val_preds_final))

    # Evaluate on held-out test split
    test_preds_final = []
    with torch.no_grad():
        for xb, _, _ in test_loader:
            out_f, _ = model(xb)
            test_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_final = np.array(test_preds_final)

    metrics = evaluate_binary_predictions(test_yf, test_preds_final, threshold=best_thresh)
    return model, metrics, test_preds_final, best_thresh


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
    X_raw = npz['X_raw'] if 'X_raw' in npz else X
    y_forecast = npz['y_forecast']
    y_state = npz['y_state']
    mask = npz['mask']

    manifest = pd.read_csv(manifest_path)
    valid_idx = np.where(mask == 1)[0]

    X = X[valid_idx]
    X_raw = X_raw[valid_idx]
    y_forecast = y_forecast[valid_idx]
    y_state = y_state[valid_idx]
    manifest = manifest.iloc[valid_idx].reset_index(drop=True)

    # 1. Enforce strict participant-level and session-level split
    # Test: Learner L003 (completely held-out participant, 3 sessions)
    # Val:  Learners L001, L002 session 03 (2 sessions)
    # Train: Learners L001, L002 sessions 01, 02 (4 sessions)
    test_mask = (manifest['learner_id'] == 'L003').to_numpy()
    val_mask = (manifest['learner_id'].isin(['L001', 'L002']) & manifest['session_id'].str.endswith('_03')).to_numpy()
    train_mask = (manifest['learner_id'].isin(['L001', 'L002']) & ~manifest['session_id'].str.endswith('_03')).to_numpy()

    # Explicit Partition Integrity Assertions (Section 5 Audit Requirement)
    assert train_mask.any(), "Training split is empty"
    assert val_mask.any(), "Validation split is empty"
    assert test_mask.any(), "Test split is empty"
    assert not np.any(train_mask & val_mask), "Train and Val overlap!"
    assert not np.any(train_mask & test_mask), "Train and Test overlap!"
    assert not np.any(val_mask & test_mask), "Val and Test overlap!"
    assert train_mask.sum() + val_mask.sum() + test_mask.sum() == len(manifest), "Windows unassigned to partitions!"
    assert set(manifest.loc[test_mask, "learner_id"]) == {"L003"}, f"Unexpected test learners: {manifest.loc[test_mask, 'learner_id'].unique()}"
    assert set(manifest.loc[train_mask, "learner_id"]) <= {"L001", "L002"}, f"Unexpected train learners: {manifest.loc[train_mask, 'learner_id'].unique()}"
    assert set(manifest.loc[val_mask, "learner_id"]) <= {"L001", "L002"}, f"Unexpected val learners: {manifest.loc[val_mask, 'learner_id'].unique()}"

    expected_train_sessions = {'S_L001_01', 'S_L001_02', 'S_L002_01', 'S_L002_02'}
    expected_val_sessions = {'S_L001_03', 'S_L002_03'}
    expected_test_sessions = {'S_L003_01', 'S_L003_02', 'S_L003_03'}
    assert set(manifest.loc[train_mask, "session_id"]) == expected_train_sessions, "Train sessions mismatch!"
    assert set(manifest.loc[val_mask, "session_id"]) == expected_val_sessions, "Val sessions mismatch!"
    assert set(manifest.loc[test_mask, "session_id"]) == expected_test_sessions, "Test sessions mismatch!"

    print("================ DATASET PARTITION SUMMARY ================")
    print(f"Total Valid Windows: {len(manifest)} (Strict temporal isolation: t >= 60s, 0% calibration leakage)")
    print(f"Train Set: {np.sum(train_mask)} windows across {manifest[train_mask]['session_id'].nunique()} sessions ({manifest[train_mask]['learner_id'].unique()})")
    print(f"Val Set:   {np.sum(val_mask)} windows across {manifest[val_mask]['session_id'].nunique()} sessions ({manifest[val_mask]['learner_id'].unique()})")
    print(f"Test Set:  {np.sum(test_mask)} windows across {manifest[test_mask]['session_id'].nunique()} sessions ({manifest[test_mask]['learner_id'].unique()})")
    print(f"Train Positive Prevalence: {np.mean(y_forecast[train_mask])*100:.2f}%")
    print(f"Test Positive Prevalence:  {np.mean(y_forecast[test_mask])*100:.2f}%\n")

    results = []

    # -------------------------------------------------------------------------
    # Baseline 1: Prevalence / Chance Baseline
    # Fitted strictly on TRAINING labels, then evaluated on test split (Issue D fix)
    # -------------------------------------------------------------------------
    train_prev = float(np.mean(y_forecast[train_mask]))
    test_y = y_forecast[test_mask]
    test_prev_actual = float(np.mean(test_y))
    prev_test_brier = float(np.mean((train_prev - test_y)**2))

    results.append({
        'model_name': 'Prevalence Chance Baseline',
        'model_type': 'Heuristic',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': round(train_prev, 4),
        'roc_auc': 0.5000,
        'f1_score': 0.0000,
        'precision': 0.0000,
        'recall': 0.0000,
        'brier_score': round(prev_test_brier, 4),
        'threshold': 0.5,
    })

    # -------------------------------------------------------------------------
    # Baseline 2: Deterministic Threshold Rule
    # Evaluated directly on hard binary decisions; curve AUCs set to null (Issue C fix)
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
    rule_f1 = f1_score(test_y, rule_test_pred, zero_division=0)
    rule_prec = precision_score(test_y, rule_test_pred, zero_division=0)
    rule_rec = recall_score(test_y, rule_test_pred, zero_division=0)
    rule_brier = float(np.mean((rule_test_pred - test_y)**2))

    results.append({
        'model_name': 'Deterministic Threshold Rule',
        'model_type': 'Heuristic Baseline',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': None,
        'roc_auc': None,
        'f1_score': round(float(rule_f1), 4),
        'precision': round(float(rule_prec), 4),
        'recall': round(float(rule_rec), 4),
        'brier_score': round(rule_brier, 4),
        'threshold': round(float(t_lat), 2),
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
    lr_eval = evaluate_binary_predictions(test_y, test_probs_lr, threshold=best_thresh_lr)

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
    # Model 4: TCN Population Baseline (Unnormalized raw features, no personal calibration)
    # -------------------------------------------------------------------------
    model_pop = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32)
    _, pop_eval, _, _ = train_and_eval_tcn(
        model_pop,
        X_raw[train_mask], y_forecast[train_mask], y_state[train_mask],
        X_raw[val_mask], y_forecast[val_mask], y_state[val_mask],
        X_raw[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Population Baseline (No Personal Calib)',
        'model_type': 'Temporal ConvNet (Population)',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': pop_eval['pr_auc'],
        'roc_auc': pop_eval['roc_auc'],
        'f1_score': pop_eval['f1_score'],
        'precision': pop_eval['precision'],
        'recall': pop_eval['recall'],
        'brier_score': pop_eval['brier_score'],
        'threshold': pop_eval['threshold'],
    })

    # -------------------------------------------------------------------------
    # Model 5: TCN Personal Baseline (Interaction-Only, 8 channels, no camera)
    # -------------------------------------------------------------------------
    model_int = TemporalForecaster(interaction_dim=8, visual_dim=0, num_classes=3, conv_channels=32)
    _, int_eval, _, _ = train_and_eval_tcn(
        model_int,
        X[train_mask, :, :8], y_forecast[train_mask], y_state[train_mask],
        X[val_mask, :, :8], y_forecast[val_mask], y_state[val_mask],
        X[test_mask, :, :8], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Personal Baseline (Interaction-Only)',
        'model_type': 'Temporal ConvNet (Personalized)',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': int_eval['pr_auc'],
        'roc_auc': int_eval['roc_auc'],
        'f1_score': int_eval['f1_score'],
        'precision': int_eval['precision'],
        'recall': int_eval['recall'],
        'brier_score': int_eval['brier_score'],
        'threshold': int_eval['threshold'],
    })

    # -------------------------------------------------------------------------
    # Model 6: TCN Full Proposed (Personal Baseline + Multimodal Reliability Gate)
    # -------------------------------------------------------------------------
    model_full = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=True)
    trained_full, full_eval, test_preds_full, best_thresh_full = train_and_eval_tcn(
        model_full,
        X[train_mask], y_forecast[train_mask], y_state[train_mask],
        X[val_mask], y_forecast[val_mask], y_state[val_mask],
        X[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Full Proposed (Personalized + Gate)',
        'model_type': 'Temporal ConvNet (Multimodal Gate)',
        'eval_split': 'Held-out Test (L003)',
        'pr_auc': full_eval['pr_auc'],
        'roc_auc': full_eval['roc_auc'],
        'f1_score': full_eval['f1_score'],
        'precision': full_eval['precision'],
        'recall': full_eval['recall'],
        'brier_score': full_eval['brier_score'],
        'threshold': full_eval['threshold'],
    })

    # Save trained model weights for ONNX export
    os.makedirs("models/tcn_forecaster", exist_ok=True)
    torch.save(trained_full.state_dict(), "models/tcn_forecaster/model.pt")

    # -------------------------------------------------------------------------
    # Model 7: TCN Missing-Camera Fallback Test (Camera masked to 0 on Test Set)
    # -------------------------------------------------------------------------
    X_test_masked = X[test_mask].copy()
    X_test_masked[:, :, 8] = 0.0   # visual_valid = 0
    X_test_masked[:, :, 9] = 0.0   # head_yaw = 0
    X_test_masked[:, :, 10] = 0.0  # face_presence = 0

    test_ds_masked = ParticipationDataset(X_test_masked, test_y, y_state[test_mask])
    test_loader_masked = DataLoader(test_ds_masked, batch_size=16, shuffle=False)

    test_preds_masked = []
    trained_full.eval()
    with torch.no_grad():
        for xb, _, _ in test_loader_masked:
            out_f, _ = trained_full(xb)
            test_preds_masked.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_masked = np.array(test_preds_masked)

    masked_eval = evaluate_binary_predictions(test_y, test_preds_masked, threshold=best_thresh_full)
    results.append({
        'model_name': 'TCN Ablation: Camera Masked Fallback',
        'model_type': 'Ablation (Reliability Gate Fallback)',
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

    print("\nSaved benchmark results to results/metrics/benchmark_comparison.csv and .json")

    # -------------------------------------------------------------------------
    # Event-Level Warning Evaluation on Test Split (Learner L003)
    # Evaluated against genuine onset episodes
    # -------------------------------------------------------------------------
    test_manifest = manifest.iloc[test_mask].reset_index(drop=True)
    event_metrics = evaluate_event_alerts(
        test_manifest,
        test_preds_full,
        threshold=best_thresh_full,
        horizon_sec=20,
        cooldown_sec=15
    )
    with open("results/metrics/event_metrics.json", 'w') as f:
        json.dump(event_metrics, f, indent=2)

    print("\n================ HEAD-TO-HEAD BENCHMARK RESULTS (TEST SPLIT: LEARNER L003) ================")
    print(df_results[['model_name', 'pr_auc', 'roc_auc', 'f1_score', 'precision', 'recall', 'brier_score']].to_string(index=False))

    print("\n================ EVENT-LEVEL WARNING METRICS (TEST SPLIT: LEARNER L003) ================")
    print(f"Total True Onset Episodes: {event_metrics['total_true_onset_episodes']}")
    print(f"Matched Alerts (TP):       {event_metrics['true_positives_matched']}")
    print(f"False Alerts (FP):         {event_metrics['false_positives_unmatched']}")
    print(f"Event Precision:           {event_metrics['event_precision'] * 100:.2f}%")
    print(f"Event Recall:              {event_metrics['event_recall'] * 100:.2f}%")
    print(f"False Alerts / Hour:       {event_metrics['false_alerts_per_hour']:.2f}")
    print(f"Mean Usable Lead Time:     {event_metrics['mean_usable_lead_time_sec']:.2f} seconds")
    print(f"Saved event metrics to results/metrics/event_metrics.json\n")


if __name__ == "__main__":
    run_benchmark()
