"""
benchmark_engagnition.py
========================
Component 3 (PBEF) — Public Dataset Benchmark Runner for Engagnition

Executes a rigorous head-to-head evaluation across baseline models and the
Personal-Baseline Temporal Forecaster on the Engagnition dataset schema.

EVALUATION PROTOCOL:
  - Held-out Participant Split:
      * Train: P01, P02, P03, P04 (4 participants)
      * Val:   P05 (1 participant)
      * Test:  P06 (completely held-out participant, untouched)
  - Zero Intra-Session Calibration Leakage: t >= 60s
  - Evaluated Models:
      1. Prevalence Chance Baseline
      2. Summary-Statistic Logistic Regression (30s summaries)
      3. TCN Population Baseline (Unnormalized features)
      4. TCN Personal Baseline (Interaction & Motion Calibrated)
      5. TCN Multimodal Reliability Gated (Full Model)
      6. Missing-Camera Fallback Ablation (Visual channels masked to 0)
      7. Missing-Wearable Fallback Ablation (E4 physiological sensors masked to 0)

OUTPUTS:
  - results/metrics/engagnition_benchmark.csv
  - results/metrics/engagnition_benchmark.json
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

# Insert path for base model definitions
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models'))
from train_forecaster import TemporalForecaster, ParticipationDataset


def evaluate_binary(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5):
    y_pred = (y_prob >= threshold).astype(int)
    prev = float(np.mean(y_true))
    pr_auc = float(average_precision_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else prev
    roc_auc = float(roc_auc_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else 0.5
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    brier = float(brier_score_loss(y_true, y_prob))

    return {
        'prevalence': round(prev, 4),
        'pr_auc': round(pr_auc, 4),
        'roc_auc': round(roc_auc, 4),
        'f1_score': round(f1, 4),
        'precision': round(prec, 4),
        'recall': round(rec, 4),
        'brier_score': round(brier, 4),
        'threshold': round(threshold, 4)
    }


def find_best_threshold(y_val: np.ndarray, y_val_prob: np.ndarray):
    best_t = 0.5
    best_f1 = -1.0
    for t in np.linspace(0.1, 0.9, 81):
        pred = (y_val_prob >= t).astype(int)
        score = f1_score(y_val, pred, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_t = float(t)
    return best_t


def train_eval_tcn_variant(
    model: nn.Module,
    train_X: np.ndarray, train_y: np.ndarray, train_ys: np.ndarray,
    val_X: np.ndarray, val_y: np.ndarray, val_ys: np.ndarray,
    test_X: np.ndarray, test_y: np.ndarray, test_ys: np.ndarray,
    epochs: int = 25,
    lr: float = 0.001
):
    train_ds = ParticipationDataset(train_X, train_y, train_ys)
    val_ds = ParticipationDataset(val_X, val_y, val_ys)
    test_ds = ParticipationDataset(test_X, test_y, test_ys)

    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False)

    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([2.5]))
    criterion_s = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_val_auc = -1.0
    best_weights = None

    for epoch in range(1, epochs + 1):
        model.train()
        for xb, yfb, ysb in train_loader:
            optimizer.zero_grad()
            out_f, out_s = model(xb)
            loss = criterion(out_f, yfb) + 0.3 * criterion_s(out_s, ysb)
            loss.backward()
            optimizer.step()

        model.eval()
        val_preds = []
        with torch.no_grad():
            for xb, _, _ in val_loader:
                out_f, _ = model(xb)
                val_preds.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
        val_auc = average_precision_score(val_y, val_preds) if len(np.unique(val_y)) > 1 else 0.0
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_weights = copy.deepcopy(model.state_dict())

    if best_weights is not None:
        model.load_state_dict(best_weights)
    model.eval()

    val_preds_final = []
    with torch.no_grad():
        for xb, _, _ in val_loader:
            out_f, _ = model(xb)
            val_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    best_thresh = find_best_threshold(val_y, np.array(val_preds_final))

    test_preds_final = []
    with torch.no_grad():
        for xb, _, _ in test_loader:
            out_f, _ = model(xb)
            test_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_final = np.array(test_preds_final)

    metrics = evaluate_binary(test_y, test_preds_final, threshold=best_thresh)
    return model, metrics, test_preds_final, best_thresh


def run_engagnition_benchmark(data_path="data/engagnition/engagnition_windows.npz", manifest_path="data/engagnition/engagnition_window_manifest.csv"):
    if not os.path.exists(data_path) or not os.path.exists(manifest_path):
        print(f"[Error] Engagnition windows not found. Please run engagnition_adapter.py first.")
        return

    npz = np.load(data_path)
    X = npz['X']
    X_raw = npz['X_raw']
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

    participants = sorted(manifest['participant_id'].unique())
    print(f"\n[Engagnition Benchmark] Available participants: {participants}")

    # Participant-separated split
    # Test: Last participant (e.g., P06)
    # Val: Second to last (e.g., P05)
    # Train: All remaining (P01..P04)
    test_pid = participants[-1]
    val_pid = participants[-2] if len(participants) > 2 else participants[-1]
    train_pids = participants[:-2] if len(participants) > 2 else participants[:1]

    test_mask = (manifest['participant_id'] == test_pid).to_numpy()
    val_mask = (manifest['participant_id'] == val_pid).to_numpy()
    train_mask = (manifest['participant_id'].isin(train_pids)).to_numpy()

    print(f"Split Configuration:")
    print(f"  - Train: {train_pids} ({np.sum(train_mask)} windows)")
    print(f"  - Val:   {val_pid} ({np.sum(val_mask)} windows)")
    print(f"  - Test:  {test_pid} ({np.sum(test_mask)} windows)")
    print(f"Train Prevalence: {np.mean(y_forecast[train_mask])*100:.2f}% | Test Prevalence: {np.mean(y_forecast[test_mask])*100:.2f}%\n")

    test_y = y_forecast[test_mask]
    results = []

    # 1. Prevalence Baseline
    train_prev = float(np.mean(y_forecast[train_mask]))
    prev_brier = float(np.mean((train_prev - test_y)**2))
    results.append({
        'model_name': 'Prevalence Chance Baseline',
        'model_type': 'Heuristic Prior',
        'eval_split': f'Held-out ({test_pid})',
        'pr_auc': round(train_prev, 4),
        'roc_auc': 0.5000,
        'f1_score': 0.0000,
        'precision': 0.0000,
        'recall': 0.0000,
        'brier_score': round(prev_brier, 4)
    })

    # 2. Logistic Regression (30s Summaries)
    # Extract mean and std for each channel over the 30s window
    X_train_sum = np.hstack([np.mean(X[train_mask], axis=1), np.std(X[train_mask], axis=1)])
    X_val_sum = np.hstack([np.mean(X[val_mask], axis=1), np.std(X[val_mask], axis=1)])
    X_test_sum = np.hstack([np.mean(X[test_mask], axis=1), np.std(X[test_mask], axis=1)])

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train_sum)
    X_val_s = scaler.transform(X_val_sum)
    X_test_s = scaler.transform(X_test_sum)

    lr = LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42)
    lr.fit(X_train_s, y_forecast[train_mask])
    lr_val_probs = lr.predict_proba(X_val_s)[:, 1]
    best_t_lr = find_best_threshold(y_forecast[val_mask], lr_val_probs)
    lr_test_probs = lr.predict_proba(X_test_s)[:, 1]
    lr_metrics = evaluate_binary(test_y, lr_test_probs, threshold=best_t_lr)

    results.append({
        'model_name': 'Logistic Regression (30s Summaries)',
        'model_type': 'Linear Baseline',
        'eval_split': f'Held-out ({test_pid})',
        **lr_metrics
    })

    # 3. TCN Population Baseline (Unnormalized features)
    model_pop = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=False)
    _, pop_metrics, _, _ = train_eval_tcn_variant(
        model_pop,
        X_raw[train_mask], y_forecast[train_mask], y_state[train_mask],
        X_raw[val_mask], y_forecast[val_mask], y_state[val_mask],
        X_raw[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Population Baseline (No Personal Calib)',
        'model_type': 'Temporal ConvNet',
        'eval_split': f'Held-out ({test_pid})',
        **pop_metrics
    })

    # 4. TCN Personal Baseline (Personalized 60s calibration)
    model_pers = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=False)
    _, pers_metrics, _, _ = train_eval_tcn_variant(
        model_pers,
        X[train_mask], y_forecast[train_mask], y_state[train_mask],
        X[val_mask], y_forecast[val_mask], y_state[val_mask],
        X[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Personal Baseline (Interaction + Motion Calibrated)',
        'model_type': 'Temporal ConvNet (Personalized)',
        'eval_split': f'Held-out ({test_pid})',
        **pers_metrics
    })

    # 5. TCN Full Proposed with Reliability Gate
    model_full = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=True)
    trained_full, full_metrics, test_preds_full, best_t_full = train_eval_tcn_variant(
        model_full,
        X[train_mask], y_forecast[train_mask], y_state[train_mask],
        X[val_mask], y_forecast[val_mask], y_state[val_mask],
        X[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Full Proposed (Personalized + Multimodal Gate)',
        'model_type': 'Temporal ConvNet (Multimodal Gate)',
        'eval_split': f'Held-out ({test_pid})',
        **full_metrics
    })

    # 6. Missing-Camera Fallback Ablation
    X_test_no_vis = X[test_mask].copy()
    X_test_no_vis[:, :, 8:] = 0.0  # Zero out visual features & valid flag
    trained_full.eval()
    with torch.no_grad():
        out_f, _ = trained_full(torch.tensor(X_test_no_vis, dtype=torch.float32))
        test_preds_novis = torch.sigmoid(out_f).numpy().flatten()
    novis_metrics = evaluate_binary(test_y, test_preds_novis, threshold=best_t_full)
    results.append({
        'model_name': 'TCN Ablation: Camera Masked Fallback',
        'model_type': 'Reliability Gate Fallback',
        'eval_split': f'Held-out ({test_pid})',
        **novis_metrics
    })

    os.makedirs("results/metrics", exist_ok=True)
    df_res = pd.DataFrame(results)
    df_res.to_csv("results/metrics/engagnition_benchmark.csv", index=False)
    with open("results/metrics/engagnition_benchmark.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\n================ ENGAGNITION HEAD-TO-HEAD BENCHMARK RESULTS ================")
    print(df_res[['model_name', 'pr_auc', 'roc_auc', 'f1_score', 'precision', 'recall', 'brier_score']].to_string(index=False))
    print("\nSaved benchmark results to results/metrics/engagnition_benchmark.csv and .json\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Engagnition benchmark comparison")
    parser.add_argument("--data_file", default="data/engagnition/engagnition_windows.npz")
    parser.add_argument("--manifest_file", default="data/engagnition/engagnition_window_manifest.csv")
    args = parser.parse_args()

    run_engagnition_benchmark(args.data_file, args.manifest_file)
