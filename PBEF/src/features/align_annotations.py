"""
align_annotations.py
====================
Component 3 (Participation Forecasting - PBEF)
Aligns continuous asynchronous learner interaction events with synchronous 
educator annotations (5-second windows and onsets) and intervention records.

INPUTS:
  --events_file:       Path to raw event log (JSONL or CSV from event_logger.ts)
  --annotations_file:  Path to educator annotations CSV (from annotation_tool.tsx)
  --interventions_file:(Optional) Path to teacher interventions CSV
  --bin_size_ms:       Temporal resolution for alignment (default: 1000 ms = 1s bins)
  --output_file:       Destination path for aligned temporal records CSV

OUTPUTS:
  - Aligned time-series DataFrame saved to CSV containing:
    session_id, learner_id, time_bin_start_ms, time_bin_end_ms,
    current_state, is_onset_in_bin, is_valid_window, has_intervention,
    event_count, response_count, mean_latency_ms, max_latency_ms,
    error_count, prompt_count, pause_duration_ms, touch_count,
    visual_valid, head_yaw_mean, face_presence_ratio
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd


def load_events(events_path: str) -> pd.DataFrame:
    """Loads interaction events from JSONL or CSV format."""
    if not os.path.exists(events_path):
        raise FileNotFoundError(f"Events file not found: {events_path}")

    if events_path.endswith('.jsonl') or events_path.endswith('.json'):
        records = []
        with open(events_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        df = pd.DataFrame(records)
    else:
        df = pd.read_csv(events_path)

    # Standardize column types
    df['time_ms'] = pd.to_numeric(df['time_ms'], errors='coerce').fillna(0).astype(int)
    if 'response_latency_ms' in df.columns:
        df['response_latency_ms'] = pd.to_numeric(df['response_latency_ms'], errors='coerce')
    if 'prompt_count' in df.columns:
        df['prompt_count'] = pd.to_numeric(df['prompt_count'], errors='coerce').fillna(0).astype(int)
    if 'accuracy' in df.columns:
        df['accuracy'] = pd.to_numeric(df['accuracy'], errors='coerce')

    return df.sort_values(by='time_ms').reset_index(drop=True)


def load_annotations(annotations_path: str) -> pd.DataFrame:
    """Loads educator annotations CSV."""
    if not os.path.exists(annotations_path):
        raise FileNotFoundError(f"Annotations file not found: {annotations_path}")

    df = pd.read_csv(annotations_path)
    required_cols = ['session_id', 'start_time_ms', 'end_time_ms', 'state_label']
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Annotation file missing required column: {col}")

    df['start_time_ms'] = pd.to_numeric(df['start_time_ms']).astype(int)
    df['end_time_ms'] = pd.to_numeric(df['end_time_ms']).astype(int)
    if 'is_onset' in df.columns:
        df['is_onset'] = df['is_onset'].astype(int)
    else:
        df['is_onset'] = 0

    if 'uncertainty' in df.columns:
        df['uncertainty'] = df['uncertainty'].astype(int)
    else:
        df['uncertainty'] = 0

    return df.sort_values(by='start_time_ms').reset_index(drop=True)


def load_interventions(interventions_path: str | None) -> pd.DataFrame:
    """Loads optional teacher intervention timeline."""
    if not interventions_path or not os.path.exists(interventions_path):
        return pd.DataFrame(columns=['session_id', 'time_ms', 'intervention_type'])
    df = pd.read_csv(interventions_path)
    df['time_ms'] = pd.to_numeric(df['time_ms']).astype(int)
    return df


def align_session_events(
    events_df: pd.DataFrame,
    annotations_df: pd.DataFrame,
    interventions_df: pd.DataFrame,
    bin_size_ms: int = 1000
) -> pd.DataFrame:
    """
    Slices session time into uniform 1-second bins and aggregates interaction features
    while aligning educator ground-truth labels and masking invalid periods.
    """
    if events_df.empty:
        raise ValueError("Events DataFrame is empty.")

    session_id = events_df['session_id'].iloc[0]
    learner_id = events_df['learner_id'].iloc[0] if 'learner_id' in events_df.columns else "UNKNOWN"

    max_event_time = events_df['time_ms'].max()
    max_ann_time = annotations_df['end_time_ms'].max() if not annotations_df.empty else max_event_time
    total_session_duration = max(max_event_time, max_ann_time)

    # Generate 1-second temporal bins
    bin_starts = np.arange(0, total_session_duration, bin_size_ms)
    aligned_rows = []

    for b_start in bin_starts:
        b_end = b_start + bin_size_ms

        # Events strictly within [b_start, b_end)
        sub_events = events_df[(events_df['time_ms'] >= b_start) & (events_df['time_ms'] < b_end)]

        # Determine ground-truth state from annotations
        matching_ann = annotations_df[
            (annotations_df['start_time_ms'] < b_end) & 
            (annotations_df['end_time_ms'] > b_start)
        ]

        if not matching_ann.empty:
            current_state = matching_ann['state_label'].iloc[0]
            is_onset = int(matching_ann['is_onset'].max() > 0)
            is_uncertain = int(matching_ann['uncertainty'].max() > 0)
        else:
            current_state = 'UNKNOWN'
            is_onset = 0
            is_uncertain = 1

        # Check for teacher interventions in bin
        sub_interventions = interventions_df[
            (interventions_df['time_ms'] >= b_start) & 
            (interventions_df['time_ms'] < b_end)
        ]
        has_intervention = int(not sub_interventions.empty)

        # Validity mask: uncertain or post-intervention bins are masked
        is_valid_window = int(is_uncertain == 0 and current_state != 'UNKNOWN')

        # Feature aggregates
        event_count = len(sub_events)
        responses = sub_events[sub_events['event_type'] == 'response']
        response_count = len(responses)

        mean_latency = responses['response_latency_ms'].mean() if response_count > 0 else 0.0
        max_latency = responses['response_latency_ms'].max() if response_count > 0 else 0.0
        
        errors = sub_events[sub_events['accuracy'] == 0]
        error_count = len(errors)

        touches = sub_events[sub_events['event_type'].isin(['touch_down', 'touch_up', 'response'])]
        touch_count = len(touches)

        max_prompts = sub_events['prompt_count'].max() if event_count > 0 else 0
        pause_duration = sub_events['pause_before_action_ms'].sum() if 'pause_before_action_ms' in sub_events.columns else 0.0

        # Visual feature defaults
        visual_valid = 0
        head_yaw_mean = 0.0
        face_present_ratio = 0.0

        aligned_rows.append({
            'session_id': session_id,
            'learner_id': learner_id,
            'time_bin_start_ms': b_start,
            'time_bin_end_ms': b_end,
            'current_state': current_state,
            'is_onset': is_onset,
            'is_valid_window': is_valid_window,
            'has_intervention': has_intervention,
            'event_count': event_count,
            'response_count': response_count,
            'mean_latency_ms': round(float(mean_latency) if not np.isnan(mean_latency) else 0.0, 2),
            'max_latency_ms': round(float(max_latency) if not np.isnan(max_latency) else 0.0, 2),
            'error_count': error_count,
            'prompt_count': int(max_prompts) if not np.isnan(max_prompts) else 0,
            'touch_count': touch_count,
            'pause_duration_ms': round(float(pause_duration) if not np.isnan(pause_duration) else 0.0, 2),
            'visual_valid': visual_valid,
            'head_yaw_mean': head_yaw_mean,
            'face_presence_ratio': face_present_ratio,
        })

    return pd.DataFrame(aligned_rows)


def main():
    parser = argparse.ArgumentParser(description="Align interaction events with educator annotations.")
    parser.add_argument("--events_file", type=str, required=True, help="Path to raw events file (JSONL/CSV)")
    parser.add_argument("--annotations_file", type=str, required=True, help="Path to annotations CSV")
    parser.add_argument("--interventions_file", type=str, default=None, help="Path to interventions CSV")
    parser.add_argument("--bin_size_ms", type=int, default=1000, help="Bin resolution in ms (default 1000)")
    parser.add_argument("--output_file", type=str, required=True, help="Output aligned CSV path")

    args = parser.parse_args()

    events_df = load_events(args.events_file)
    annotations_df = load_annotations(args.annotations_file)
    interventions_df = load_interventions(args.interventions_file)

    aligned_df = align_session_events(events_df, annotations_df, interventions_df, args.bin_size_ms)
    os.makedirs(os.path.dirname(os.path.abspath(args.output_file)), exist_ok=True)
    aligned_df.to_csv(args.output_file, index=False)
    print(f"[align_annotations] Successfully aligned {len(aligned_df)} bins -> {args.output_file}")


if __name__ == "__main__":
    main()
