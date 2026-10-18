"""
demo_heldout_window.py
======================
Component 3 (PBEF) — PP1 Live Demonstration Script

Demonstrates end-to-end forecasting on a real held-out clinical participant window:
  1. Loads a 30s input history window from held-out test participants (e.g. P40, P35).
  2. Runs client-side browser-compatible inference via ONNX and PyTorch.
  3. Displays predicted 20-second future decrease onset probability and current state.
  4. Demonstrates graceful missing-visual-data fallback (camera disconnection).
  5. Evaluates against ground-truth outcome.
  6. Displays non-diagnostic ethical boundaries.
"""

import os
import sys
import argparse
import numpy as np
import pandas as pd
import torch
import onnxruntime as ort

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'models'))
from train_forecaster import TemporalForecaster

STATE_LABELS = {0: "ACTIVE (Engaged)", 1: "PASSIVE_DECREASE (Drifting)", 2: "REGULATING (Self-soothing)"}


def run_demo(window_idx=None, pid_target='P40'):
    data_path = "data/engagnition/engagnition_windows.npz"
    manifest_path = "data/engagnition/engagnition_window_manifest.csv"
    onnx_path = "models/tcn_forecaster/model.onnx"
    pt_path = "models/tcn_forecaster/model.pt"

    if not os.path.exists(data_path) or not os.path.exists(manifest_path):
        print(f"[Error] Required dataset files not found: {data_path}, {manifest_path}")
        return

    npz = np.load(data_path)
    X = npz['X']
    X_raw = npz['X_raw']
    y_forecast = npz['y_forecast']
    y_state = npz['y_state']
    manifest = pd.read_csv(manifest_path)

    # Filter to held-out test participant
    test_pids = ['P40', 'P35', 'P28', 'P39', 'P42', 'P20', 'P26']
    test_mask = manifest['participant_id'].isin(test_pids) & (manifest['is_valid'] == 1)
    
    if pid_target:
        cand_mask = (manifest['participant_id'] == pid_target) & test_mask
    else:
        cand_mask = test_mask

    cand_indices = np.where(cand_mask)[0]
    if len(cand_indices) == 0:
        cand_indices = np.where(test_mask)[0]

    # Select a positive onset window if available to demonstrate advance warning
    pos_cand = [idx for idx in cand_indices if y_forecast[idx] == 1]
    chosen_idx = pos_cand[0] if (window_idx is None and pos_cand) else (window_idx or cand_indices[0])

    row = manifest.iloc[chosen_idx]
    x_sample = X[chosen_idx]       # (30, 11)
    x_raw_sample = X_raw[chosen_idx] # (30, 11)
    true_label = int(y_forecast[chosen_idx])
    curr_state = int(y_state[chosen_idx])
    cutoff_time_s = row['cutoff_time_ms'] / 1000.0

    print("\n" + "=" * 78)
    print("  PBEF COMPONENT 3 — PP1 PARTICIPATION FORECASTING LIVE DEMONSTRATION")
    print("=" * 78)
    print(f"Participant ID:        {row['participant_id']} ({row['condition']} condition)")
    print(f"Session Cutoff Time:   {cutoff_time_s:.1f} seconds (Input history: [{cutoff_time_s-30:.1f}s to {cutoff_time_s:.1f}s])")
    print(f"Target Forecast Range: ({cutoff_time_s:.1f}s to {cutoff_time_s+20:.1f}s] (Strict 20s rising-edge arrival)")
    print(f"Current State at t:    {STATE_LABELS.get(curr_state, str(curr_state))}")
    print(f"Ground Truth Outcome:  {'DECREASE ONSET IN NEXT 20s' if true_label == 1 else 'REMAINS ENGAGED'}")

    print("\n[1] 30-Second Historical Sequence Summary:")
    print(f"  - Interaction Taps (Raw): {x_raw_sample[:, 0].sum():.0f} actions (Mean rate: {x_raw_sample[:, 0].mean():.2f}/s)")
    print(f"  - Inactivity Duration:    {x_raw_sample[-1, 1]:.1f} seconds since last event")
    print(f"  - Movement (Acc SVM):     Mean = {x_raw_sample[:, 2].mean():.1f}, Std = {x_raw_sample[:, 3].mean():.1f}")
    print(f"  - Autonomic (GSR & ST):   GSR = {x_raw_sample[:, 4].mean():.2f} uS, Temp = {x_raw_sample[:, 5].mean():.1f} C")
    print(f"  - Gaze Fixation Ratio:    {x_raw_sample[:, 9].mean()*100:.1f}% on-screen (Away: {x_raw_sample[:, 10].mean()*100:.1f}%)")

    # Reshape for TCN: [Batch=1, Channels=11, Time=30]
    x_tensor = torch.tensor(x_sample, dtype=torch.float32).unsqueeze(0).permute(0, 2, 1)

    # 1. Full Multimodal Inference
    model = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32, use_gate=True)
    if os.path.exists(pt_path):
        model.load_state_dict(torch.load(pt_path, map_location='cpu'))
    model.eval()

    with torch.no_grad():
        f_logit, s_logits = model(x_tensor)
        p_prob = torch.sigmoid(f_logit).item()
        p_state = torch.argmax(s_logits, dim=-1).item()

    # 2. Camera-Masked Fallback (Visual Channels 8..10 Zeroed)
    x_tensor_masked = x_tensor.clone()
    x_tensor_masked[:, 8:, :] = 0.0

    with torch.no_grad():
        f_logit_m, s_logits_m = model(x_tensor_masked)
        p_prob_m = torch.sigmoid(f_logit_m).item()
        p_state_m = torch.argmax(s_logits_m, dim=-1).item()

    # 3. ONNX Browser Runtime Check
    onnx_prob = None
    if os.path.exists(onnx_path):
        sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
        onnx_outs = sess.run(None, {'input_features': x_tensor.numpy()})
        onnx_prob = float(1.0 / (1.0 + np.exp(-onnx_outs[0][0][0])))

    print("\n[2] Model Forecast Results & Multimodal Comparison:")
    print("  " + "-" * 74)
    print(f"  {'Modality Condition':<25} | {'Predicted Onset Risk':<22} | {'Forecast Decision (t=0.30)':<20}")
    print("  " + "-" * 74)
    alert_full = "ALERT: IMMINENT ONSET" if p_prob >= 0.30 else "PASS: STABLE"
    alert_masked = "ALERT: IMMINENT ONSET" if p_prob_m >= 0.30 else "PASS: STABLE"
    print(f"  {'Full Multimodal':<25} | {p_prob*100:6.2f}%                 | {alert_full:<20}")
    print(f"  {'Camera-Masked (Fallback)':<25} | {p_prob_m*100:6.2f}%                 | {alert_masked:<20}")
    print("  " + "-" * 74)
    if onnx_prob is not None:
        print(f"  [Browser ONNX Parity]: ONNX risk = {onnx_prob*100:.2f}% (Numerical diff with PyTorch: {abs(p_prob - onnx_prob):.2e})")

    # Evaluation against Ground Truth
    print("\n[3] Outcome Evaluation:")
    if true_label == 1:
        if p_prob >= 0.30:
            print("  -> TRUE POSITIVE: Imminent decrease correctly anticipated in advance!")
        else:
            print("  -> FALSE NEGATIVE: Onset occurred but probability was below threshold.")
    else:
        if p_prob < 0.30:
            print("  -> TRUE NEGATIVE: Correctly remained quiet; no false alert triggered.")
        else:
            print("  -> FALSE ALERT: Probability exceeded threshold during steady participation.")

    print("\n" + "=" * 78)
    print("  ETHICAL AND NON-DIAGNOSTIC ADVISORY BOUNDARY")
    print("=" * 78)
    print("  * System forecasts task participation decrease; it does NOT diagnose autism or affect.")
    print("  * Looking away or self-regulatory pauses are explicitly protected under annotation protocol.")
    print("  * Output is advisory to the educator dashboard only; never interrupts child agency.")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PBEF Live Demonstration")
    parser.add_argument("--pid", default="P40", help="Target held-out participant ID")
    parser.add_argument("--index", type=int, default=None, help="Specific window index")
    args = parser.parse_args()

    run_demo(window_idx=args.index, pid_target=args.pid)
