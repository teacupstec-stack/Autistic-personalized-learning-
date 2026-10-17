"""
engagnition_adapter.py
======================
Component 3 (PBEF) — Public Dataset Ingestion Adapter for Engagnition

Processes the Engagnition dataset (Nature Scientific Data 2024, N=57 autistic children)
for the Personal-Baseline Participation Forecasting (PBEF) task.

DATASET SCHEMA & MODALITIES:
  - Participants: P01 to P57 (children with ASD)
  - Behavioral / Serious Game Stream: 'Defeat the Monster' (game events, hit/miss, pause intervals)
  - Movement Stream: Empatica E4 3D Accelerometer (motion intensity & physical regulation)
  - Physiological Wearable Stream: Electrodermal Activity (GSR), Skin Temperature (ST)
  - Video / Gaze Stream: Screen gaze fixation ratio & validity mask
  - Ground-Truth Annotations: Ternary engagement scale (High=2, Medium=1, Low/Disengaged=0)
  - Interventions: Educator / therapist assistance timestamps

FORECASTING TARGET SPECIFICATION:
  - Input Window: 30 seconds of temporal history (t - 30s to t)
  - Target Horizon: 20 seconds into the future (t to t + 20s)
  - Forecast Label (y_forecast): Binary indicator (1 if engagement transitions to Low or
    therapist intervention occurs within the next 20s, 0 otherwise)
  - Personal Baseline: First 60s of session used for baseline calibration (t >= 60s strictly)
  - Reliability Gating: Explicit masks for missing video/gaze and missing wearable sensors

USAGE:
  1. Inspect downloaded Figshare data:
     python src/data/engagnition_adapter.py --data_dir data/engagnition/raw --inspect

  2. Generate schema-compliant verification samples (if Figshare download is in progress):
     python src/data/engagnition_adapter.py --generate_sample --num_participants 6 --output_dir data/engagnition

  3. Build 30s/20s forecasting windows:
     python src/data/engagnition_adapter.py --data_dir data/engagnition --build_windows --output_dir data/engagnition
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd


ENGAGNITION_FEATURES = [
    'game_event_count',       # 0: Interaction pace
    'hit_count',              # 1: Successful motor/cognitive actions
    'miss_count',             # 2: Errors or failed attempts
    'pause_duration_ms',      # 3: Motor hesitation / inaction time
    'accel_magnitude_mean',   # 4: E4 physical movement / motor activity
    'gsr_mean',               # 5: E4 Electrodermal activity (arousal)
    'skin_temp_mean',         # 6: E4 skin temperature
    'physio_valid',           # 7: Wearable sensor validity mask (0 or 1)
    'gaze_fixation_ratio',    # 8: Camera screen gaze fixation ratio
    'head_pose_yaw_var',      # 9: Head movement variability
    'visual_valid'            # 10: Camera stream validity mask (0 or 1)
]


def generate_synthetic_engagnition(output_dir: str, num_participants: int = 6, session_len_sec: int = 300, seed: int = 42):
    """
    Generates realistic, schema-identical sample files matching Engagnition's exact
    directory structure and CSV formats for pipeline testing prior to Figshare download.
    """
    np.random.seed(seed)
    os.makedirs(output_dir, exist_ok=True)
    raw_dir = os.path.join(output_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)

    print(f"[Engagnition] Generating {num_participants} schema-compliant participant records in {raw_dir}...")

    all_participants_meta = []

    for p_idx in range(1, num_participants + 1):
        pid = f"P{p_idx:02d}"
        p_dir = os.path.join(raw_dir, pid)
        os.makedirs(p_dir, exist_ok=True)

        total_sec = session_len_sec
        timestamps = np.arange(0, total_sec * 1000, 1000)  # 1 Hz aggregated bins

        # 1. E4 Accelerometer Data (x, y, z, magnitude)
        accel_base = np.random.uniform(0.8, 1.2)
        acc_mag = np.random.normal(accel_base, 0.2, len(timestamps))
        acc_mag = np.clip(acc_mag, 0.1, 3.5)

        # 2. E4 GSR (Electrodermal activity) in microSiemens
        gsr_base = np.random.uniform(2.0, 8.0)
        gsr = gsr_base + np.cumsum(np.random.normal(0, 0.05, len(timestamps)))
        gsr = np.clip(gsr, 0.5, 20.0)

        # 3. E4 Skin Temperature in Celsius
        st_base = np.random.uniform(32.0, 34.5)
        st = st_base + np.cumsum(np.random.normal(0, 0.01, len(timestamps)))

        # 4. Behavioral game events (Defeat the Monster exergame)
        game_events = []
        hits = []
        misses = []
        pauses = []
        gaze = []
        head_yaw = []
        labels = []  # Ternary: 2 = High, 1 = Medium, 0 = Low (Disengaged)

        # Pick 1 or 2 decrease / disengagement episodes (e.g., around t=120s to t=160s)
        onset_sec = int(np.random.uniform(90, 150))
        decrease_len = int(np.random.uniform(25, 45))
        onset_end = onset_sec + decrease_len

        for sec in range(total_sec):
            in_decrease = (onset_sec <= sec < onset_end)
            in_calib = (sec < 60)

            if in_decrease:
                # Disengaged state: low actions, high pauses, misses, low gaze fixation
                state = 0  # Low / Disengaged
                ev = np.random.choice([0, 1], p=[0.7, 0.3])
                h = 0 if ev == 0 else (1 if np.random.rand() < 0.3 else 0)
                m = ev - h
                p = int(np.random.uniform(1500, 3000))
                g = float(np.random.uniform(0.1, 0.45))
                y_var = float(np.random.uniform(15.0, 35.0))
            elif in_calib:
                state = 2  # Baseline Active / High
                ev = np.random.choice([1, 2, 3], p=[0.3, 0.5, 0.2])
                h = int(np.random.binomial(ev, 0.85))
                m = ev - h
                p = int(np.random.uniform(200, 900))
                g = float(np.random.uniform(0.7, 0.98))
                y_var = float(np.random.uniform(2.0, 8.0))
            else:
                # Typical active/medium play
                state = np.random.choice([1, 2], p=[0.4, 0.6])
                ev = np.random.choice([1, 2], p=[0.5, 0.5])
                h = int(np.random.binomial(ev, 0.75))
                m = ev - h
                p = int(np.random.uniform(400, 1200))
                g = float(np.random.uniform(0.6, 0.92))
                y_var = float(np.random.uniform(4.0, 12.0))

            game_events.append(ev)
            hits.append(h)
            misses.append(m)
            pauses.append(p)
            gaze.append(round(g, 3))
            head_yaw.append(round(y_var, 2))
            labels.append(state)

        # 5. Create intervention near end of decrease
        interventions = []
        interv_sec = onset_end - int(np.random.uniform(3, 7))
        interventions.append({
            'participant_id': pid,
            'time_ms': interv_sec * 1000,
            'type': 'therapist_physical_redirect',
            'notes': 'Therapist verbal prompt and monster target repositioning'
        })
        pd.DataFrame(interventions).to_csv(os.path.join(p_dir, "interventions.csv"), index=False)

        # 6. Save combined synchronized timeline CSV
        timeline_df = pd.DataFrame({
            'participant_id': pid,
            'time_bin_start_ms': timestamps,
            'time_bin_end_ms': timestamps + 1000,
            'game_event_count': game_events,
            'hit_count': hits,
            'miss_count': misses,
            'pause_duration_ms': pauses,
            'accel_magnitude_mean': np.round(acc_mag, 3),
            'gsr_mean': np.round(gsr, 3),
            'skin_temp_mean': np.round(st, 2),
            'physio_valid': 1,  # E4 worn
            'gaze_fixation_ratio': gaze,
            'head_pose_yaw_var': head_yaw,
            'visual_valid': 1 if (p_idx % 2 == 1) else 0,  # Simulate some participants with camera disabled
            'engagement_state': labels  # 2: High, 1: Medium, 0: Low/Disengaged
        })
        timeline_df.to_csv(os.path.join(p_dir, f"{pid}_timeline.csv"), index=False)

        all_participants_meta.append({
            'participant_id': pid,
            'total_duration_sec': total_sec,
            'has_visual': int(p_idx % 2 == 1),
            'has_wearable': 1,
            'decrease_onset_sec': onset_sec,
            'decrease_end_sec': onset_end
        })

    pd.DataFrame(all_participants_meta).to_csv(os.path.join(output_dir, "participants_metadata.csv"), index=False)
    print(f"[Engagnition] Successfully generated {num_participants} participant sessions in {output_dir}")


def inspect_engagnition_data(data_dir: str):
    """
    Audits an Engagnition directory to report cohort size, sampling consistency,
    missing streams, and label distributions.
    """
    raw_dir = os.path.join(data_dir, "raw") if os.path.exists(os.path.join(data_dir, "raw")) else data_dir
    p_dirs = [d for d in os.listdir(raw_dir) if os.path.isdir(os.path.join(raw_dir, d)) and d.startswith("P")]

    print("\n" + "=" * 65)
    print("  ENGAGNITION DATASET AUDIT & INSPECTION REPORT")
    print("=" * 65)
    print(f"Directory: {raw_dir}")
    print(f"Identified Participant Sessions: {len(p_dirs)} ({sorted(p_dirs)[:10]}...)")

    if not p_dirs:
        print("[Warning] No participant directories (P01, P02...) found in directory.")
        return

    total_bins = 0
    total_low = 0
    total_med = 0
    total_high = 0
    participants_with_visual = 0

    for pid in sorted(p_dirs):
        p_path = os.path.join(raw_dir, pid)
        timeline_files = [f for f in os.listdir(p_path) if f.endswith("_timeline.csv") or f == "timeline.csv"]
        if timeline_files:
            df = pd.read_csv(os.path.join(p_path, timeline_files[0]))
            total_bins += len(df)
            counts = df['engagement_state'].value_counts()
            total_low += counts.get(0, 0)
            total_med += counts.get(1, 0)
            total_high += counts.get(2, 0)
            if 'visual_valid' in df.columns and df['visual_valid'].max() > 0:
                participants_with_visual += 1

    print(f"Total 1-second Bins: {total_bins} ({total_bins / 3600:.2f} hours)")
    print(f"Engagement Label Breakdown:")
    print(f"  - High Engagement (State 2):    {total_high} bins ({total_high/max(1, total_bins)*100:.1f}%)")
    print(f"  - Medium Engagement (State 1):  {total_med} bins ({total_med/max(1, total_bins)*100:.1f}%)")
    print(f"  - Low / Disengaged (State 0):   {total_low} bins ({total_low/max(1, total_bins)*100:.1f}%)")
    print(f"Camera Stream Availability: {participants_with_visual}/{len(p_dirs)} participants")
    print("=" * 65 + "\n")


def build_engagnition_windows(
    data_dir: str,
    output_dir: str,
    history_sec: int = 30,
    forecast_sec: int = 20,
    stride_sec: int = 1,
    calib_sec: int = 60
):
    """
    Extracts strictly non-leaking overlapping windows from Engagnition timelines:
      - Window input: [t - history_sec, t)
      - Calibration: t >= max(history_sec, calib_sec) to avoid calibration leakage
      - Forecast target: binary flag indicating if engagement drops to 0 (Low) in [t, t + forecast_sec)
    """
    raw_dir = os.path.join(data_dir, "raw") if os.path.exists(os.path.join(data_dir, "raw")) else data_dir
    p_dirs = [d for d in os.listdir(raw_dir) if os.path.isdir(os.path.join(raw_dir, d)) and d.startswith("P")]

    if not p_dirs:
        raise FileNotFoundError(f"No participant folders found in {raw_dir}")

    all_X = []
    all_X_raw = []
    all_y_forecast = []
    all_y_state = []
    all_masks = []
    manifest_rows = []

    start_t = max(history_sec, calib_sec)

    for pid in sorted(p_dirs):
        p_path = os.path.join(raw_dir, pid)
        timeline_files = [f for f in os.listdir(p_path) if f.endswith("_timeline.csv") or f == "timeline.csv"]
        if not timeline_files:
            continue

        df = pd.read_csv(os.path.join(p_path, timeline_files[0]))

        # Interventions
        interv_file = os.path.join(p_path, "interventions.csv")
        interv_times = []
        if os.path.exists(interv_file):
            idf = pd.read_csv(interv_file)
            if not idf.empty and 'time_ms' in idf.columns:
                interv_times = idf['time_ms'].tolist()

        raw_features = df[ENGAGNITION_FEATURES].to_numpy(dtype=np.float32)
        total_bins = len(df)

        # Baseline calibration statistics (first calib_sec bins)
        calib_bins = min(total_bins, calib_sec)
        base_mean = np.mean(raw_features[:calib_bins], axis=0)
        base_std = np.std(raw_features[:calib_bins], axis=0) + 1e-5

        # Detect discrete onset episode start times in this participant
        onset_mask = (df['engagement_state'] == 0).to_numpy()
        # Find rising edge where state becomes 0
        rising_edges = np.where((onset_mask[1:] == True) & (onset_mask[:-1] == False))[0] + 1
        true_onset_times = df['time_bin_start_ms'].iloc[rising_edges].tolist()

        for t in range(start_t, total_bins - forecast_sec + 1, stride_sec):
            history_slice = raw_features[t - history_sec:t].copy()

            # Personal Baseline Normalization:
            # Normalize interaction and physical movement channels (indices 0..6)
            history_norm = history_slice.copy()
            history_norm[:, :7] = (history_slice[:, :7] - base_mean[:7]) / base_std[:7]

            t_cutoff_ms = int(df['time_bin_start_ms'].iloc[t])
            current_state = int(df['engagement_state'].iloc[t - 1])

            future_slice = df.iloc[t:t + forecast_sec]
            # Target is 1 if any bin in [t, t + forecast_sec) is Low (0)
            has_decrease_onset = int((future_slice['engagement_state'] == 0).max() > 0)

            # Invalidate if teacher intervention occurs in target window
            t_future_end_ms = t_cutoff_ms + forecast_sec * 1000
            has_intervention = any(t_cutoff_ms <= it < t_future_end_ms for it in interv_times)

            is_valid = int(not has_intervention)

            window_id = f"{pid}_t{t_cutoff_ms}"
            all_X.append(history_norm)
            all_X_raw.append(history_slice)
            all_y_forecast.append(has_decrease_onset)
            all_y_state.append(current_state)
            all_masks.append(is_valid)

            manifest_rows.append({
                'window_id': window_id,
                'participant_id': pid,
                'cutoff_time_ms': t_cutoff_ms,
                'target_onset': has_decrease_onset,
                'current_state': current_state,
                'is_valid': is_valid,
                'has_intervention': int(has_intervention),
                'participant_true_onsets': json.dumps(true_onset_times)
            })

    X = np.array(all_X, dtype=np.float32)
    X_raw = np.array(all_X_raw, dtype=np.float32)
    y_forecast = np.array(all_y_forecast, dtype=np.int64)
    y_state = np.array(all_y_state, dtype=np.int64)
    mask = np.array(all_masks, dtype=np.int32)
    manifest = pd.DataFrame(manifest_rows)

    os.makedirs(output_dir, exist_ok=True)
    np.savez_compressed(
        os.path.join(output_dir, "engagnition_windows.npz"),
        X=X,
        X_raw=X_raw,
        y_forecast=y_forecast,
        y_state=y_state,
        mask=mask,
        feature_names=np.array(ENGAGNITION_FEATURES)
    )
    manifest.to_csv(os.path.join(output_dir, "engagnition_window_manifest.csv"), index=False)

    print(f"\n[Engagnition] Window Extraction Complete:")
    print(f"  - Total extracted windows: {len(manifest)}")
    print(f"  - Valid eligible windows:  {np.sum(mask == 1)}")
    print(f"  - Positive forecast rate:  {np.mean(y_forecast[mask == 1])*100:.2f}%")
    print(f"  - Array Shape (X):         {X.shape}")
    print(f"  - Saved to: {output_dir}/engagnition_windows.npz and manifest.csv\n")


def main():
    parser = argparse.ArgumentParser(description="Engagnition Dataset Ingestion and Window Extraction Adapter")
    parser.add_argument("--data_dir", type=str, default="data/engagnition", help="Path to Engagnition dataset")
    parser.add_argument("--output_dir", type=str, default="data/engagnition", help="Path to output processed windows")
    parser.add_argument("--inspect", action="store_true", help="Inspect and audit raw Engagnition dataset")
    parser.add_argument("--generate_sample", action="store_true", help="Generate schema-identical verification sample files")
    parser.add_argument("--num_participants", type=int, default=6, help="Number of sample participants to generate")
    parser.add_argument("--build_windows", action="store_true", help="Extract 30s/20s non-leaking windows")

    args = parser.parse_args()

    if args.generate_sample:
        generate_synthetic_engagnition(args.output_dir, num_participants=args.num_participants)

    if args.inspect:
        inspect_engagnition_data(args.data_dir)

    if args.build_windows:
        build_engagnition_windows(args.data_dir, args.output_dir)


if __name__ == "__main__":
    main()
