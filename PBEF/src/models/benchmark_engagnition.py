"""
benchmark_engagnition.py
========================
Component 3 (PBEF) — Rigorous Public Dataset Benchmark for Engagnition

Evaluates baseline and proposed forecasters on the real Engagnition clinical dataset
under strict onset forecasting, zero calibration leakage, and fair ablated baselines.

METHODOLOGICAL GUARANTEES & DEFECT REMEDIATIONS:
  1. True Onset Evaluation:
     Evaluates anticipation of real behavioral transitions into Low engagement (0).
  2. Statistically Sound Prevalence Baseline:
     Evaluated through evaluate_binary using constant probability array (train prior).
  3. Fair Population Baseline:
     Population TCN is trained on globally standardized training data (X_pop_norm),
     fairly isolating the exact value of personal baseline calibration.
  4. Modality Dropout & Correct Tensor Orientation:
     Modality dropout (p=0.3) applied during training; masked ablation evaluated
     through ParticipationDataset with correct [Batch, Channels, Time] permutation.
  5. Dynamic pos_weight:
     pos_weight = (1 - p) / p dynamically computed from training labels.
  6. Discrete Event-Level Evaluation:
     Evaluates advance warnings against discrete onset episodes with 15s cooldown.
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
from torch.utils.data import DataLoader
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

# Insert paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'evaluation'))
from train_forecaster import TemporalForecaster, ParticipationDataset
from evaluate_events import evaluate_event_alerts


def evaluate_binary(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5):
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


def find_best_threshold(y_val: np.ndarray, y_val_prob: np.ndarray):
    """Finds decision threshold maximizing F1 on validation split only."""
    best_t = 0.5
    best_f1 = -1.0
    for t in np.linspace(0.05, 0.95, 91):
        pred = (y_val_prob >= t).astype(int)
        score = f1_score(y_val, pred, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_t = float(t)
    return best_t


def train_eval_tcn_variant(
    model: nn.Module,
    train_X: np.ndarray, train_yf: np.ndarray, train_ys: np.ndarray,
    val_X: np.ndarray, val_yf: np.ndarray, val_ys: np.ndarray,
    test_X: np.ndarray, test_yf: np.ndarray, test_ys: np.ndarray,
    epochs: int = 25,
    lr: float = 0.001,
    use_modality_dropout: bool = False
):
    """Trains a TCN variant with dynamic pos_weight and modality dropout."""
    train_ds = ParticipationDataset(train_X, train_yf, train_ys)
    val_ds = ParticipationDataset(val_X, val_yf, val_ys)
    test_ds = ParticipationDataset(test_X, test_yf, test_ys)

    train_loader = DataLoader(train_ds, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=32, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False)

    # Dynamic pos_weight based on train prevalence
    p_train = float(np.mean(train_yf))
    pos_w = torch.tensor([(1.0 - p_train) / max(p_train, 1e-4)])

    criterion_f = nn.BCEWithLogitsLoss(pos_weight=pos_w)
    criterion_s = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_val_auc = -1.0
    best_weights = None

    for epoch in range(1, epochs + 1):
        model.train()
        for xb, yfb, ysb in train_loader:
            # Modality dropout: randomly zero visual channels (8..10)
            if use_modality_dropout and torch.rand(1).item() < 0.3:
                xb = xb.clone()
                xb[:, 8:, :] = 0.0

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
            best_weights = copy.deepcopy(model.state_dict())

    if best_weights is not None:
        model.load_state_dict(best_weights)
    model.eval()

    # Find optimal threshold on validation split
    val_preds_final = []
    with torch.no_grad():
        for xb, _, _ in val_loader:
            out_f, _ = model(xb)
            val_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    best_thresh = find_best_threshold(val_yf, np.array(val_preds_final))

    # Evaluate on held-out test split
    test_preds_final = []
    with torch.no_grad():
        for xb, _, _ in test_loader:
            out_f, _ = model(xb)
            test_preds_final.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_final = np.array(test_preds_final)

    metrics = evaluate_binary(test_yf, test_preds_final, threshold=best_thresh)
    return model, metrics, test_preds_final, best_thresh


def run_engagnition_benchmark(
    data_path="data/engagnition/engagnition_windows.npz",
    manifest_path="data/engagnition/engagnition_window_manifest.csv"
):
    np.random.seed(42)
    torch.manual_seed(42)

    if not os.path.exists(data_path) or not os.path.exists(manifest_path):
        print(f"[Error] Required dataset files not found: {data_path}, {manifest_path}")
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

    print("\n" + "=" * 70)
    print("  ENGAGNITION CLINICAL BENCHMARK (REAL AUTISM COHORT)")
    print("=" * 70)
    print(f"Total Valid Windows: {len(manifest)} across {manifest['participant_id'].nunique()} participants")
    print(f"Total True Decrease Onset Windows: {np.sum(y_forecast)} ({np.mean(y_forecast)*100:.2f}% prevalence)")

    # Stratified multi-participant clinical split:
    # Test split (7 held-out participants):
    #   - With onsets: P40 (HPE), P35 (LPE), P28 (LPE)
    #   - Active controls: P39 (HPE), P42 (HPE), P20 (LPE), P26 (LPE)
    # Val split (7 held-out participants):
    #   - With onsets: P53 (HPE), P27 (LPE), P29 (LPE)
    #   - Active controls: P43 (HPE), P45 (HPE), P21 (LPE), P22 (LPE)
    # Train split: remaining 23 participants
    test_pids = ['P40', 'P35', 'P28', 'P39', 'P42', 'P20', 'P26']
    val_pids = ['P53', 'P27', 'P29', 'P43', 'P45', 'P21', 'P22']
    train_pids = [p for p in manifest['participant_id'].unique() if p not in test_pids and p not in val_pids]

    test_mask = manifest['participant_id'].isin(test_pids).to_numpy()
    val_mask = manifest['participant_id'].isin(val_pids).to_numpy()
    train_mask = manifest['participant_id'].isin(train_pids).to_numpy()

    # Split assertions
    assert not np.any(train_mask & val_mask), "Train and Val overlap!"
    assert not np.any(train_mask & test_mask), "Train and Test overlap!"
    assert not np.any(val_mask & test_mask), "Val and Test overlap!"
    assert train_mask.sum() + val_mask.sum() + test_mask.sum() == len(manifest), "Unassigned windows!"

    print("\nDataset Partition Summary:")
    print(f"  - Train Split: {len(train_pids)} participants ({np.sum(train_mask)} windows, {np.sum(y_forecast[train_mask])} onsets, {np.mean(y_forecast[train_mask])*100:.2f}% prev)")
    print(f"  - Val Split:   {len(val_pids)} participants ({np.sum(val_mask)} windows, {np.sum(y_forecast[val_mask])} onsets, {np.mean(y_forecast[val_mask])*100:.2f}% prev)")
    print(f"  - Test Split:  {len(test_pids)} participants ({np.sum(test_mask)} windows, {np.sum(y_forecast[test_mask])} onsets, {np.mean(y_forecast[test_mask])*100:.2f}% prev)")

    test_y = y_forecast[test_mask]
    results = []

    # -------------------------------------------------------------------------
    # Baseline 1: Prevalence Chance Baseline (Train Prior)
    # DEFECT FIX 2: Compute real evaluate_binary metrics on constant array
    # -------------------------------------------------------------------------
    train_prev = float(np.mean(y_forecast[train_mask]))
    const_train = np.full(len(test_y), train_prev, dtype=np.float64)
    prev_metrics = evaluate_binary(test_y, const_train, threshold=0.5)

    results.append({
        'model_name': 'Prevalence Chance Baseline (Train Prior)',
        'model_type': 'Heuristic Prior',
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **prev_metrics
    })

    # -------------------------------------------------------------------------
    # Baseline 2: Summary-Statistic Logistic Regression (30s Summaries)
    # -------------------------------------------------------------------------
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
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **lr_metrics
    })

    # -------------------------------------------------------------------------
    # Model 3: TCN Population Baseline (Fair Global Train Standardization)
    # DEFECT FIX 6: Globally normalized across training set (no personal calibration)
    # -------------------------------------------------------------------------
    mu = X_raw[train_mask].mean(axis=(0, 1), keepdims=True)
    sd = np.maximum(X_raw[train_mask].std(axis=(0, 1), keepdims=True), 1e-3)
    X_pop_norm = (X_raw - mu) / sd

    model_pop = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=False)
    _, pop_metrics, _, _ = train_eval_tcn_variant(
        model_pop,
        X_pop_norm[train_mask], y_forecast[train_mask], y_state[train_mask],
        X_pop_norm[val_mask], y_forecast[val_mask], y_state[val_mask],
        X_pop_norm[test_mask], test_y, y_state[test_mask]
    )
    results.append({
        'model_name': 'TCN Population Baseline (Global Standardization)',
        'model_type': 'Temporal ConvNet (Population)',
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **pop_metrics
    })

    # -------------------------------------------------------------------------
    # Model 4: TCN Personal Baseline (Personal Calibration, No Gate)
    # -------------------------------------------------------------------------
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
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **pers_metrics
    })

    # -------------------------------------------------------------------------
    # Model 5: TCN Full Proposed (Personalized + Multimodal Gate + Modality Dropout)
    # DEFECT FIX 5: Trained with modality dropout to handle missing visual data gracefully
    # -------------------------------------------------------------------------
    model_full = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=True)
    trained_full, full_metrics, test_preds_full, best_t_full = train_eval_tcn_variant(
        model_full,
        X[train_mask], y_forecast[train_mask], y_state[train_mask],
        X[val_mask], y_forecast[val_mask], y_state[val_mask],
        X[test_mask], test_y, y_state[test_mask],
        use_modality_dropout=True
    )
    results.append({
        'model_name': 'TCN Full Proposed (Personalized + Multimodal Gate)',
        'model_type': 'Temporal ConvNet (Multimodal Gate)',
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **full_metrics
    })

    # -------------------------------------------------------------------------
    # Model 6: TCN Missing-Camera Fallback Ablation
    # DEFECT FIX 5: Evaluated with correct ParticipationDataset tensor orientation!
    # -------------------------------------------------------------------------
    X_val_no_vis = X[val_mask].copy()
    X_val_no_vis[:, :, 8:] = 0.0
    val_ds_masked = ParticipationDataset(X_val_no_vis, y_forecast[val_mask], y_state[val_mask])
    val_loader_masked = DataLoader(val_ds_masked, batch_size=32, shuffle=False)

    val_preds_novis = []
    trained_full.eval()
    with torch.no_grad():
        for xb, _, _ in val_loader_masked:
            out_f, _ = trained_full(xb)
            val_preds_novis.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    best_t_masked = find_best_threshold(y_forecast[val_mask], np.array(val_preds_novis))

    X_test_no_vis = X[test_mask].copy()
    X_test_no_vis[:, :, 8:] = 0.0
    test_ds_masked = ParticipationDataset(X_test_no_vis, test_y, y_state[test_mask])
    test_loader_masked = DataLoader(test_ds_masked, batch_size=32, shuffle=False)

    test_preds_novis = []
    with torch.no_grad():
        for xb, _, _ in test_loader_masked:
            out_f, _ = trained_full(xb)
            test_preds_novis.extend(torch.sigmoid(out_f).cpu().numpy().flatten())
    test_preds_novis = np.array(test_preds_novis)

    novis_metrics = evaluate_binary(test_y, test_preds_novis, threshold=best_t_masked)
    results.append({
        'model_name': 'TCN Ablation: Camera Masked Fallback',
        'model_type': 'Reliability Gate Fallback',
        'eval_split': f'Held-out Test ({len(test_pids)} Participants)',
        **novis_metrics
    })

    # Save benchmark table
    os.makedirs("results/metrics", exist_ok=True)
    df_res = pd.DataFrame(results)
    df_res.to_csv("results/metrics/engagnition_benchmark.csv", index=False)
    with open("results/metrics/engagnition_benchmark.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\n================ ENGAGNITION HEAD-TO-HEAD BENCHMARK RESULTS ================")
    print(df_res[['model_name', 'pr_auc', 'roc_auc', 'f1_score', 'precision', 'recall', 'brier_score']].to_string(index=False))

    # -------------------------------------------------------------------------
    # DEFECT FIX 9: Event-Level Evaluation on Engagnition
    # -------------------------------------------------------------------------
    test_manifest = manifest.iloc[test_mask].reset_index(drop=True)
    event_metrics = evaluate_event_alerts(
        test_manifest,
        test_preds_full,
        threshold=best_t_full,
        horizon_sec=20,
        cooldown_sec=15
    )
    with open("results/metrics/engagnition_event_metrics.json", "w") as f:
        json.dump(event_metrics, f, indent=2)

    print("\n================ ENGAGNITION EVENT-LEVEL WARNING METRICS ================")
    print(f"Total True Onset Episodes: {event_metrics['total_true_onset_episodes']}")
    print(f"Matched Alerts (TP):       {event_metrics['true_positives_matched']}")
    print(f"False Alerts (FP):         {event_metrics['false_positives_unmatched']}")
    print(f"Event Precision:           {event_metrics['event_precision'] * 100:.2f}%")
    print(f"Event Recall:              {event_metrics['event_recall'] * 100:.2f}%")
    print(f"False Alerts / Hour:       {event_metrics['false_alerts_per_hour']:.2f}")
    print(f"Mean Usable Lead Time:     {event_metrics['mean_usable_lead_time_sec']:.2f} seconds\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Engagnition benchmark comparison")
    parser.add_argument("--data_file", default="data/engagnition/engagnition_windows.npz")
    parser.add_argument("--manifest_file", default="data/engagnition/engagnition_window_manifest.csv")
    args = parser.parse_args()

    run_engagnition_benchmark(args.data_file, args.manifest_file)
