"""
engagnition_adapter.py
======================
Component 3 (PBEF) — Public Dataset Ingestion Adapter for Engagnition

Processes the REAL Engagnition dataset (Nature Scientific Data 2024, N=57 autistic children,
38 experimental participants with complete multimodal time-series).

DATASET ARCHITECTURE & REAL MODALITIES:
  - Participants: P20 to P38 (LPE condition), P39 to P57 (HPE condition) -> 38 participants
  - Time Synchronization: All streams aligned to SGTime (Serious Game Time in seconds)
  - Raw Data Streams per participant:
      1. EngagementData.csv: Ground-truth expert engagement (2=High, 1=Medium, 0=Low/Disengaged)
      2. PerformanceData.csv: Cognitive/motor game events & hits
      3. GazeData.csv: Eye gaze fixation (1=target/screen, 0=looking away)
      4. E4AccData.csv: Empatica E4 3-axis Accelerometer & Acc_SVM (physical movement magnitude)
      5. E4GsrData.csv: Empatica E4 Electrodermal Activity (GSR in uS)
      6. E4TmpData.csv: Empatica E4 Skin Temperature (ST in Celsius)
      7. InterventionData.xlsx: Therapist discrete & continuous intervention timestamps

STANDARDIZED 11-CHANNEL TENSOR REPRESENTATION:
  Interaction & Physiological Stream (Channels 0..7):
    - 0: performance_count (game interaction events per second)
    - 1: inactivity_sec (seconds since last game interaction)
    - 2: acc_svm_mean (physical motion intensity)
    - 3: acc_svm_std (motor variability / movement jerk)
    - 4: gsr_mean (electrodermal activity / autonomic arousal)
    - 5: st_mean (peripheral skin temperature)
    - 6: physio_valid (1 if E4 wearable active, 0 if missing)
    - 7: condition_hpe (1 if HPE condition, 0 if LPE condition)
  Visual & Gaze Stream (Channels 8..10):
    - 8: visual_valid (1 if camera gaze active, 0 if missing)
    - 9: gaze_ratio (screen gaze fixation ratio in second bin)
    - 10: gaze_away_ratio (fraction looking away: 1.0 - gaze_ratio)

FORECASTING TARGET SPECIFICATION:
  - Input Window: 30 seconds of historical observations (t - 30s to t)
  - Target Horizon: 20 seconds into the future (t to t + 20s)
  - Forecast Label (y_forecast): Binary flag (1 if Engagement drops to 0 or therapist
    intervention occurs in the 20s future horizon, 0 otherwise)
  - Calibration: Strictly starts at t >= 60s (0% intra-session calibration leakage)
"""

import os
import sys
import glob
import json
import argparse
import numpy as np
import pandas as pd


ENGAGNITION_FEATURES = [
    'performance_count',
    'inactivity_sec',
    'acc_svm_mean',
    'acc_svm_std',
    'gsr_mean',
    'st_mean',
    'physio_valid',
    'condition_hpe',
    'visual_valid',
    'gaze_ratio',
    'gaze_away_ratio'
]


def load_interventions_map(raw_dir: str):
    """Loads therapist intervention timestamps from InterventionData.xlsx."""
    int_file = os.path.join(raw_dir, 'InterventionData.xlsx')
    interventions_by_p = {}
    if os.path.exists(int_file):
        try:
            df_int = pd.read_excel(int_file, header=1)
            df_int['Participants'] = df_int['Participants'].ffill()
            for p, grp in df_int.groupby('Participants'):
                times = pd.to_numeric(grp['The time when intervention occurs (seconds)'], errors='coerce').dropna().tolist()
                interventions_by_p[str(p).strip()] = sorted(times)
        except Exception as e:
            print(f"[Warning] Could not parse InterventionData.xlsx: {e}")
    return interventions_by_p


def inspect_engagnition_data(data_dir: str):
    """Audits the extracted real Engagnition dataset."""
    raw_dir = os.path.join(data_dir, "raw") if os.path.exists(os.path.join(data_dir, "raw")) else data_dir
    interventions = load_interventions_map(raw_dir)

    all_participants = []
    for cond in ['HPE condition', 'LPE condition']:
        cond_dir = os.path.join(raw_dir, cond)
        if os.path.exists(cond_dir):
            for pdir in sorted(glob.glob(os.path.join(cond_dir, 'P*'))):
                pid = os.path.basename(pdir)
                eng_file = os.path.join(pdir, 'EngagementData.csv')
                if os.path.exists(eng_file):
                    all_participants.append((cond, pid, pdir))

    print("\n" + "=" * 70)
    print("  REAL ENGAGNITION DATASET AUDIT (NATURE SCIENTIFIC DATA 2024)")
    print("=" * 70)
    print(f"Dataset root: {raw_dir}")
    print(f"Total Multimodal Participant Sessions: {len(all_participants)}")

    if not all_participants:
        print("[Error] No participant folders found. Please extract 'Engagnition Dataset.zip' into data/engagnition/raw.")
        return

    total_duration = 0
    total_low_bins = 0
    total_med_bins = 0
    total_high_bins = 0

    p_summaries = []
    for cond, pid, pdir in all_participants:
        df_eng = pd.read_csv(os.path.join(pdir, 'EngagementData.csv'))
        max_t = float(df_eng['SGTime'].max())
        counts = df_eng['Engagement'].value_counts().to_dict()
        interv_count = len(interventions.get(pid, []))

        total_duration += max_t
        p_summaries.append({
            'Participant': pid,
            'Condition': 'HPE' if 'HPE' in cond else 'LPE',
            'Duration_s': round(max_t, 1),
            'Low_Pct': round(counts.get(0, 0) / len(df_eng) * 100, 1),
            'Interventions': interv_count
        })

    df_p = pd.DataFrame(p_summaries)
    print(f"\nCohort Overview:")
    print(f"  - Total Recorded Time: {total_duration / 3600:.2f} hours (Mean session: {total_duration / len(all_participants):.1f}s)")
    print(f"  - Participants with Low Engagement (0): {len(df_p[df_p['Low_Pct'] > 0])} / {len(df_p)}")
    print(f"  - Participants with Therapist Interventions: {len(df_p[df_p['Interventions'] > 0])} / {len(df_p)}")
    print(f"\nParticipant Sample Distribution (First 10):")
    print(df_p.head(10).to_string(index=False))
    print("=" * 70 + "\n")


def process_single_participant(cond: str, pid: str, pdir: str, interventions: list):
    """Aggregates all continuous streams of a participant into synchronized 1-second bins."""
    df_eng = pd.read_csv(os.path.join(pdir, 'EngagementData.csv'))
    max_t = int(df_eng['SGTime'].max())
    if max_t < 70:
        return None  # Too short for 60s calibration + 20s horizon

    sec_bins = np.arange(0, max_t + 1)
    n_bins = len(sec_bins)

    # 1. Engagement state (mode per second)
    df_eng['sec'] = np.floor(df_eng['SGTime']).astype(int)
    eng_grouped = df_eng[df_eng['sec'] <= max_t].groupby('sec')['Engagement'].agg(lambda s: s.mode().iloc[0])
    eng_state = eng_grouped.reindex(sec_bins, fill_value=1).to_numpy()

    # 2. Performance game events (count per second)
    perf_file = os.path.join(pdir, 'PerformanceData.csv')
    perf_counts = np.zeros(n_bins, dtype=np.float32)
    if os.path.exists(perf_file):
        df_perf = pd.read_csv(perf_file)
        if not df_perf.empty and 'SGTime' in df_perf.columns:
            df_perf['sec'] = np.floor(df_perf['SGTime']).astype(int)
            p_cnt = df_perf[(df_perf['sec'] >= 0) & (df_perf['sec'] <= max_t)].groupby('sec').size()
            perf_counts = p_cnt.reindex(sec_bins, fill_value=0).to_numpy().astype(np.float32)

    # Inactivity seconds (time since last interaction)
    inactivity = np.zeros(n_bins, dtype=np.float32)
    last_act = 0
    for i in range(n_bins):
        if perf_counts[i] > 0:
            last_act = i
        inactivity[i] = float(i - last_act)

    # 3. E4 Accelerometer (Acc_SVM mean and std per second)
    acc_file = os.path.join(pdir, 'E4AccData.csv')
    acc_mean = np.zeros(n_bins, dtype=np.float32)
    acc_std = np.zeros(n_bins, dtype=np.float32)
    has_e4 = 0
    if os.path.exists(acc_file):
        df_acc = pd.read_csv(acc_file)
        if not df_acc.empty and 'SGTime' in df_acc.columns and 'Acc_SVM' in df_acc.columns:
            has_e4 = 1
            df_acc['sec'] = np.floor(df_acc['SGTime']).astype(int)
            acc_g = df_acc[(df_acc['sec'] >= 0) & (df_acc['sec'] <= max_t)].groupby('sec')['Acc_SVM']
            m = acc_g.mean().reindex(sec_bins).ffill().bfill().to_numpy()
            s = acc_g.std().reindex(sec_bins).fillna(0.0).to_numpy()
            acc_mean = np.nan_to_num(m, nan=64.0).astype(np.float32)
            acc_std = np.nan_to_num(s, nan=1.0).astype(np.float32)

    # 4. E4 GSR (EDA)
    gsr_file = os.path.join(pdir, 'E4GsrData.csv')
    gsr_mean = np.zeros(n_bins, dtype=np.float32)
    if os.path.exists(gsr_file):
        df_gsr = pd.read_csv(gsr_file)
        if not df_gsr.empty and 'SGTime' in df_gsr.columns and 'GSR' in df_gsr.columns:
            has_e4 = 1
            df_gsr['sec'] = np.floor(df_gsr['SGTime']).astype(int)
            g_mean = df_gsr[(df_gsr['sec'] >= 0) & (df_gsr['sec'] <= max_t)].groupby('sec')['GSR'].mean()
            gsr_mean = np.nan_to_num(g_mean.reindex(sec_bins).ffill().bfill().to_numpy(), nan=2.0).astype(np.float32)

    # 5. E4 Skin Temperature
    tmp_file = os.path.join(pdir, 'E4TmpData.csv')
    st_mean = np.zeros(n_bins, dtype=np.float32)
    if os.path.exists(tmp_file):
        df_tmp = pd.read_csv(tmp_file)
        col = 'ST' if 'ST' in df_tmp.columns else ('Tmp' if 'Tmp' in df_tmp.columns else df_tmp.columns[-1])
        df_tmp['sec'] = np.floor(df_tmp['SGTime']).astype(int)
        t_mean = df_tmp[(df_tmp['sec'] >= 0) & (df_tmp['sec'] <= max_t)].groupby('sec')[col].mean()
        st_mean = np.nan_to_num(t_mean.reindex(sec_bins).ffill().bfill().to_numpy(), nan=32.0).astype(np.float32)

    # 6. Gaze Data (fraction of screen gaze fixation)
    gaze_file = os.path.join(pdir, 'GazeData.csv')
    gaze_ratio = np.ones(n_bins, dtype=np.float32) * 0.8
    has_gaze = 0
    if os.path.exists(gaze_file):
        df_gaze = pd.read_csv(gaze_file)
        if not df_gaze.empty and 'SGTime' in df_gaze.columns and 'Gaze' in df_gaze.columns:
            has_gaze = 1
            df_gaze['sec'] = np.floor(df_gaze['SGTime']).astype(int)
            gz = df_gaze[(df_gaze['sec'] >= 0) & (df_gaze['sec'] <= max_t)].groupby('sec')['Gaze'].mean()
            gaze_ratio = np.nan_to_num(gz.reindex(sec_bins).ffill().bfill().to_numpy(), nan=0.8).astype(np.float32)

    gaze_away = (1.0 - gaze_ratio).astype(np.float32)
    cond_hpe = 1.0 if 'HPE' in cond else 0.0

    # Build 11-channel feature matrix
    feature_matrix = np.column_stack([
        perf_counts,                 # 0
        inactivity,                  # 1
        acc_mean,                    # 2
        acc_std,                     # 3
        gsr_mean,                    # 4
        st_mean,                     # 5
        np.full(n_bins, has_e4),     # 6: physio_valid
        np.full(n_bins, cond_hpe),   # 7: condition_hpe
        np.full(n_bins, has_gaze),   # 8: visual_valid
        gaze_ratio,                  # 9: gaze_ratio
        gaze_away                    # 10: gaze_away_ratio
    ])

    return {
        'participant_id': pid,
        'condition': cond,
        'feature_matrix': feature_matrix,
        'engagement_state': eng_state,
        'interventions': interventions,
        'duration_sec': max_t
    }


def build_engagnition_windows(
    data_dir: str,
    output_dir: str,
    history_sec: int = 30,
    forecast_sec: int = 20,
    stride_sec: int = 1,
    calib_sec: int = 60
):
    """
    Extracts strictly non-leaking overlapping windows from the real Engagnition cohort.
    Enforces personal baseline calibration for t >= max(history_sec, calib_sec) = 60s.
    """
    raw_dir = os.path.join(data_dir, "raw") if os.path.exists(os.path.join(data_dir, "raw")) else data_dir
    interventions_map = load_interventions_map(raw_dir)

    all_participants = []
    for cond in ['HPE condition', 'LPE condition']:
        cond_dir = os.path.join(raw_dir, cond)
        if os.path.exists(cond_dir):
            for pdir in sorted(glob.glob(os.path.join(cond_dir, 'P*'))):
                pid = os.path.basename(pdir)
                eng_file = os.path.join(pdir, 'EngagementData.csv')
                if os.path.exists(eng_file):
                    all_participants.append((cond, pid, pdir))

    if not all_participants:
        raise FileNotFoundError(f"No participant folders found in {raw_dir}")

    print(f"\n[Engagnition] Processing real multimodal time-series for {len(all_participants)} participants...")

    all_X = []
    all_X_raw = []
    all_y_forecast = []
    all_y_state = []
    all_masks = []
    manifest_rows = []

    start_t = max(history_sec, calib_sec)

    for cond, pid, pdir in all_participants:
        intervs = interventions_map.get(pid, [])
        session_data = process_single_participant(cond, pid, pdir, intervs)
        if session_data is None:
            continue

        raw_feat = session_data['feature_matrix']
        eng = session_data['engagement_state']
        total_bins = session_data['duration_sec']

        # Personal Baseline Calibration (First 60s of this participant)
        calib_bins = min(total_bins, calib_sec)
        base_mean = np.mean(raw_feat[:calib_bins], axis=0)
        base_std = np.std(raw_feat[:calib_bins], axis=0) + 1e-5

        # Detect discrete onset timestamps for this participant
        onset_mask = (eng == 0)
        rising_edges = np.where((onset_mask[1:] == True) & (onset_mask[:-1] == False))[0] + 1
        true_onset_times = [int(edge * 1000) for edge in rising_edges]

        for t in range(start_t, total_bins - forecast_sec + 1, stride_sec):
            # 1. 30s Input History
            history_slice = raw_feat[t - history_sec:t].copy()

            # Personal Baseline Normalization (Motion, interaction, and physiological features 0..5)
            history_norm = history_slice.copy()
            history_norm[:, :6] = (history_slice[:, :6] - base_mean[:6]) / base_std[:6]

            t_cutoff_ms = int(t * 1000)
            current_state = int(eng[t - 1])

            # 2. 20s Future Forecast Target in [t, t + forecast_sec)
            future_eng = eng[t:t + forecast_sec]
            has_low_engagement = int((future_eng == 0).any())

            # Check if therapist intervention occurs in target window
            t_future_end_sec = t + forecast_sec
            has_intervention = any(t <= it < t_future_end_sec for it in intervs)

            # Combined target: participation decrease onset (Low engagement OR required therapist prompt)
            y_f = int(has_low_engagement or has_intervention)

            is_valid = 1  # All bins are valid observation time

            window_id = f"{pid}_t{t_cutoff_ms}"
            all_X.append(history_norm)
            all_X_raw.append(history_slice)
            all_y_forecast.append(y_f)
            all_y_state.append(current_state)
            all_masks.append(is_valid)

            manifest_rows.append({
                'window_id': window_id,
                'participant_id': pid,
                'condition': 'HPE' if 'HPE' in cond else 'LPE',
                'cutoff_time_ms': t_cutoff_ms,
                'target_onset': y_f,
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

    print(f"\n[Engagnition Real Extraction Complete]")
    print(f"  - Total extracted windows: {len(manifest)}")
    print(f"  - Valid eligible windows:  {np.sum(mask == 1)}")
    print(f"  - Total unique participants: {manifest['participant_id'].nunique()}")
    print(f"  - Positive forecast rate:  {np.mean(y_forecast)*100:.2f}%")
    print(f"  - Array Shape (X):         {X.shape}")
    print(f"  - Saved to: {output_dir}/engagnition_windows.npz and manifest.csv\n")


def main():
    parser = argparse.ArgumentParser(description="Engagnition Dataset Ingestion and Window Extraction Adapter")
    parser.add_argument("--data_dir", type=str, default="data/engagnition", help="Path to Engagnition dataset")
    parser.add_argument("--output_dir", type=str, default="data/engagnition", help="Path to output processed windows")
    parser.add_argument("--inspect", action="store_true", help="Inspect and audit raw Engagnition dataset")
    parser.add_argument("--build_windows", action="store_true", help="Extract 30s/20s non-leaking windows")

    args = parser.parse_args()

    if args.inspect:
        inspect_engagnition_data(args.data_dir)

    if args.build_windows:
        build_engagnition_windows(args.data_dir, args.output_dir)


if __name__ == "__main__":
    main()
