"""
engagnition_adapter.py
======================
Component 3 (PBEF) — Public Clinical Dataset Ingestion & Window Extractor

Processes the REAL Engagnition dataset (Nature Scientific Data 2024, N=57 autistic children,
38 experimental participants) into strictly non-leaking, causal 30s/20s forecasting windows.

METHODOLOGICAL GUARANTEES & DEFECT REMEDIATIONS:
  1. True Onset Forecasting:
     Target y_forecast = 1 if and only if an engagement transition into Low (0) occurs
     strictly in the future horizon: t < T_onset <= t + 20s.
     Windows where current_state == 0 (already disengaged) are excluded from onset forecasting.
  2. Separate Target for Interventions:
     Therapist assistance is recorded as an independent target (target_intervention),
     preventing conflation of behavioral decrease with educator actions.
  3. Causal Preprocessing (Zero Lookahead Leakage):
     Removed all .bfill() backward filling. Time-series use forward-fill only (.ffill())
     followed by domain-appropriate baseline constants (fillna).
  4. Zero Intra-Session Calibration Leakage:
     Window extraction starts strictly at t >= (calib_sec + history_sec) = 90s.
     The 30-second historical sequence [t - 30s, t) is strictly past the initial
     60-second personal calibration period [0, 60s).
  5. Constant Channel Protection:
     Standard deviations are clamped: base_std = np.maximum(std, 1e-3) to prevent division by zero.
"""

import os
import sys
import glob
import json
import argparse
import numpy as np
import pandas as pd


ENGAGNITION_FEATURES = [
    'performance_count',   # 0: Game interaction events in bin
    'inactivity_sec',      # 1: Seconds elapsed since last game interaction
    'acc_svm_mean',        # 2: Empatica E4 3D Accelerometer SVM magnitude
    'acc_svm_std',         # 3: Motor jerk / acceleration standard deviation
    'gsr_mean',            # 4: Electrodermal Activity (GSR in uS)
    'st_mean',             # 5: Peripheral Skin Temperature (Celsius)
    'physio_valid',        # 6: Wearable validity mask (1 if active, 0 if missing)
    'condition_hpe',       # 7: Condition indicator (1 if HPE, 0 if LPE)
    'visual_valid',        # 8: Camera validity mask (1 if active, 0 if missing)
    'gaze_ratio',          # 9: Screen gaze fixation ratio in bin
    'gaze_away_ratio'      # 10: Fraction looking away (1.0 - gaze_ratio)
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
        print("[Error] No participant folders found in data/engagnition/raw.")
        return

    total_duration = 0
    p_summaries = []
    for cond, pid, pdir in all_participants:
        df_eng = pd.read_csv(os.path.join(pdir, 'EngagementData.csv'))
        min_t = float(df_eng['SGTime'].min())
        max_t = float(df_eng['SGTime'].max())
        counts = df_eng['Engagement'].value_counts().to_dict()
        interv_count = len(interventions.get(pid, []))

        total_duration += (max_t - min_t)
        p_summaries.append({
            'Participant': pid,
            'Condition': 'HPE' if 'HPE' in cond else 'LPE',
            'Start_s': round(min_t, 1),
            'Duration_s': round(max_t - min_t, 1),
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
    """
    Aggregates continuous streams into 1-second bins using strict causal filtering.
    Backward filling (.bfill()) is explicitly banned to prevent lookahead leakage.
    """
    df_eng = pd.read_csv(os.path.join(pdir, 'EngagementData.csv'))
    min_t = int(np.floor(df_eng['SGTime'].min()))
    max_t = int(np.floor(df_eng['SGTime'].max()))
    if (max_t - min_t) < 95:
        return None  # Insufficient duration for 60s calib + 30s history + 20s horizon

    sec_bins = np.arange(min_t, max_t + 1)
    n_bins = len(sec_bins)

    # 1. Engagement state (mode per second)
    df_eng['sec'] = np.floor(df_eng['SGTime']).astype(int)
    eng_grouped = df_eng.groupby('sec')['Engagement'].agg(lambda s: s.mode().iloc[0])
    eng_state = eng_grouped.reindex(sec_bins, fill_value=1).to_numpy()

    # 2. Performance game events (count per second)
    perf_file = os.path.join(pdir, 'PerformanceData.csv')
    perf_counts = np.zeros(n_bins, dtype=np.float32)
    if os.path.exists(perf_file):
        df_perf = pd.read_csv(perf_file)
        if not df_perf.empty and 'SGTime' in df_perf.columns:
            df_perf['sec'] = np.floor(df_perf['SGTime']).astype(int)
            p_cnt = df_perf.groupby('sec').size()
            perf_counts = p_cnt.reindex(sec_bins, fill_value=0).to_numpy().astype(np.float32)

    # Inactivity seconds (time since last interaction)
    inactivity = np.zeros(n_bins, dtype=np.float32)
    last_act = 0
    for i in range(n_bins):
        if perf_counts[i] > 0:
            last_act = i
        inactivity[i] = float(i - last_act)

    # 3. E4 Accelerometer (Causal forward fill only; no bfill)
    acc_file = os.path.join(pdir, 'E4AccData.csv')
    acc_mean = np.full(n_bins, 64.0, dtype=np.float32)
    acc_std = np.full(n_bins, 1.0, dtype=np.float32)
    has_e4 = 0
    if os.path.exists(acc_file):
        df_acc = pd.read_csv(acc_file)
        if not df_acc.empty and 'SGTime' in df_acc.columns and 'Acc_SVM' in df_acc.columns:
            has_e4 = 1
            df_acc['sec'] = np.floor(df_acc['SGTime']).astype(int)
            acc_g = df_acc.groupby('sec')['Acc_SVM']
            # Causal filling: forward-fill past observations only, default to 64.0
            m = acc_g.mean().reindex(sec_bins).ffill().fillna(64.0).to_numpy()
            s = acc_g.std().reindex(sec_bins).ffill().fillna(1.0).to_numpy()
            acc_mean = np.nan_to_num(m, nan=64.0).astype(np.float32)
            acc_std = np.nan_to_num(s, nan=1.0).astype(np.float32)

    # 4. E4 GSR (EDA)
    gsr_file = os.path.join(pdir, 'E4GsrData.csv')
    gsr_mean = np.full(n_bins, 2.0, dtype=np.float32)
    if os.path.exists(gsr_file):
        df_gsr = pd.read_csv(gsr_file)
        if not df_gsr.empty and 'SGTime' in df_gsr.columns and 'GSR' in df_gsr.columns:
            has_e4 = 1
            df_gsr['sec'] = np.floor(df_gsr['SGTime']).astype(int)
            g_mean = df_gsr.groupby('sec')['GSR'].mean()
            # Causal filling: forward-fill past only, default to 2.0 uS
            gsr_m = g_mean.reindex(sec_bins).ffill().fillna(2.0).to_numpy()
            gsr_mean = np.nan_to_num(gsr_m, nan=2.0).astype(np.float32)

    # 5. E4 Skin Temperature
    tmp_file = os.path.join(pdir, 'E4TmpData.csv')
    st_mean = np.full(n_bins, 32.0, dtype=np.float32)
    if os.path.exists(tmp_file):
        df_tmp = pd.read_csv(tmp_file)
        col = 'ST' if 'ST' in df_tmp.columns else ('Tmp' if 'Tmp' in df_tmp.columns else df_tmp.columns[-1])
        df_tmp['sec'] = np.floor(df_tmp['SGTime']).astype(int)
        t_mean = df_tmp.groupby('sec')[col].mean()
        st_m = t_mean.reindex(sec_bins).ffill().fillna(32.0).to_numpy()
        st_mean = np.nan_to_num(st_m, nan=32.0).astype(np.float32)

    # 6. Gaze Data
    gaze_file = os.path.join(pdir, 'GazeData.csv')
    gaze_ratio = np.full(n_bins, 0.8, dtype=np.float32)
    has_gaze = 0
    if os.path.exists(gaze_file):
        df_gaze = pd.read_csv(gaze_file)
        if not df_gaze.empty and 'SGTime' in df_gaze.columns and 'Gaze' in df_gaze.columns:
            has_gaze = 1
            df_gaze['sec'] = np.floor(df_gaze['SGTime']).astype(int)
            gz = df_gaze.groupby('sec')['Gaze'].mean()
            gz_m = gz.reindex(sec_bins).ffill().fillna(0.8).to_numpy()
            gaze_ratio = np.nan_to_num(gz_m, nan=0.8).astype(np.float32)

    gaze_away = (1.0 - gaze_ratio).astype(np.float32)
    cond_hpe = 1.0 if 'HPE' in cond else 0.0

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
        'sec_bins': sec_bins,
        'interventions': interventions,
        'duration_sec': n_bins
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
    Extracts strictly non-leaking overlapping windows from the real Engagnition cohort:
      - Calibration: first 60 seconds (t in [0, 60s))
      - Input history: strictly starts at t >= calib_sec + history_sec = 90s,
        ensuring [t - 30s, t) is strictly >= 60s (0% calibration leakage).
      - Target: binary indicator of a true decrease onset occurring in (t, t + 20s].
      - Disengaged windows: if current_state == 0 at cutoff, window is skipped.
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
    all_y_intervention = []
    all_y_state = []
    all_masks = []
    manifest_rows = []

    # Strict Zero-Leakage Constraint: input history [t - 30, t) must NOT overlap calibration [0, 60)
    start_t = calib_sec + history_sec  # = 90 seconds

    total_skipped_already_low = 0

    for cond, pid, pdir in all_participants:
        intervs = interventions_map.get(pid, [])
        session_data = process_single_participant(cond, pid, pdir, intervs)
        if session_data is None:
            continue

        raw_feat = session_data['feature_matrix']
        eng = session_data['engagement_state']
        sec_bins = session_data['sec_bins']
        total_bins = session_data['duration_sec']

        if total_bins <= start_t + forecast_sec:
            continue

        # Personal Baseline Calibration: computed strictly on the first calib_sec (60s)
        calib_bins = min(total_bins, calib_sec)
        base_mean = np.mean(raw_feat[:calib_bins], axis=0)
        base_std = np.maximum(np.std(raw_feat[:calib_bins], axis=0), 1e-3)

        # Detect discrete onset arrival seconds (transitions into Low state 0)
        # Rising edge condition: state becomes 0 when previous was non-zero
        onset_rising_indices = np.where((eng[1:] == 0) & (eng[:-1] != 0))[0] + 1
        true_onset_seconds = [int(sec_bins[idx]) for idx in onset_rising_indices]
        true_onset_ms = [sec * 1000 for sec in true_onset_seconds]

        for t in range(start_t, total_bins - forecast_sec + 1, stride_sec):
            t_curr_sec = int(sec_bins[t])
            current_state = int(eng[t - 1])

            # DEFECT FIX 1: If child is already in low engagement (0), this is NOT a decrease onset!
            if current_state == 0:
                total_skipped_already_low += 1
                continue

            # 1. 30s Input History: strictly [t - history_sec, t)
            history_slice = raw_feat[t - history_sec:t].copy()

            # Personal Baseline Normalization (Channels 0..5: motion, pacing, autonomic signals)
            history_norm = history_slice.copy()
            history_norm[:, :6] = (history_slice[:, :6] - base_mean[:6]) / base_std[:6]

            t_cutoff_ms = t_curr_sec * 1000
            t_future_end_sec = t_curr_sec + forecast_sec
            t_future_end_ms = t_future_end_sec * 1000

            # DEFECT FIX 1: True onset condition: a decrease transition begins in (t, t + 20s]
            has_future_onset = int(any(t_curr_sec < onset_s <= t_future_end_sec for onset_s in true_onset_seconds))

            # Secondary target: therapist intervention in (t, t + 20s]
            has_future_intervention = int(any(t_curr_sec < it <= t_future_end_sec for it in intervs))

            # Intervention in history flag [t - history_sec, t)
            has_hist_intervention = int(any(t_curr_sec - history_sec <= it < t_curr_sec for it in intervs))

            is_valid = 1
            window_id = f"{pid}_t{t_cutoff_ms}"

            all_X.append(history_norm)
            all_X_raw.append(history_slice)
            all_y_forecast.append(has_future_onset)
            all_y_intervention.append(has_future_intervention)
            all_y_state.append(current_state)
            all_masks.append(is_valid)

            manifest_rows.append({
                'window_id': window_id,
                'session_id': f"{cond[:3]}_{pid}",
                'participant_id': pid,
                'condition': 'HPE' if 'HPE' in cond else 'LPE',
                'cutoff_time_ms': t_cutoff_ms,
                'target_onset': has_future_onset,
                'target_intervention': has_future_intervention,
                'current_state': current_state,
                'is_valid': is_valid,
                'has_intervention_in_history': has_hist_intervention,
                'session_true_onsets': json.dumps(true_onset_ms)
            })

    X = np.array(all_X, dtype=np.float32)
    X_raw = np.array(all_X_raw, dtype=np.float32)
    y_forecast = np.array(all_y_forecast, dtype=np.int64)
    y_intervention = np.array(all_y_intervention, dtype=np.int64)
    y_state = np.array(all_y_state, dtype=np.int64)
    mask = np.array(all_masks, dtype=np.int32)
    manifest = pd.DataFrame(manifest_rows)

    os.makedirs(output_dir, exist_ok=True)
    np.savez_compressed(
        os.path.join(output_dir, "engagnition_windows.npz"),
        X=X,
        X_raw=X_raw,
        y_forecast=y_forecast,
        y_intervention=y_intervention,
        y_state=y_state,
        mask=mask,
        feature_names=np.array(ENGAGNITION_FEATURES)
    )
    manifest.to_csv(os.path.join(output_dir, "engagnition_window_manifest.csv"), index=False)

    print(f"\n[Engagnition Remediated Window Extraction Complete]")
    print(f"  - Total extracted windows: {len(manifest)}")
    print(f"  - Valid eligible windows:  {np.sum(mask == 1)}")
    print(f"  - Windows skipped (already low): {total_skipped_already_low}")
    print(f"  - Total unique participants: {manifest['participant_id'].nunique()}")
    print(f"  - True decrease onset rate:  {np.mean(y_forecast)*100:.2f}% (Rare event forecasting)")
    print(f"  - Future intervention rate:  {np.mean(y_intervention)*100:.2f}%")
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
