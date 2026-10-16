"""
generate_sample_sessions.py
===========================
Component 3 (Participation Forecasting - PBEF)
Generates realistic, clearly documented sample interaction timelines and aligned educator
annotations for pipeline verification and PP1 demonstration.

IMPORTANT NOTE:
  These are synthetic verification fixtures designed to validate temporal alignment,
  absence of leakage, and end-to-end model execution. As emphasized in the Component 3 guide,
  synthetic data cannot establish real-world clinical effectiveness.

INPUTS:
  --num_learners: Number of simulated learners (default: 3)
  --sessions_per_learner: Sessions per learner (default: 3)
  --session_length_sec: Duration in seconds per session (default: 300 = 5 minutes)
  --output_dir: Output directory (default: data/synthetic)

OUTPUTS:
  - raw_events_{session_id}.jsonl
  - annotations_{session_id}.csv
  - interventions_{session_id}.csv
"""

import os
import sys
import json
import argparse
import random
import numpy as np
import pandas as pd


def generate_session(
    learner_id: str,
    session_id: str,
    session_length_sec: int = 300,
    seed: int = 42
):
    random.seed(seed)
    np.random.seed(seed)

    events = []
    annotations = []
    interventions = []

    total_ms = session_length_sec * 1000
    activities = [f"matching_{learner_id}_01", f"sorting_{learner_id}_02", f"sequencing_{learner_id}_03"]
    curr_activity = activities[0]

    # Session start event
    events.append({
        "learner_id": learner_id,
        "session_id": session_id,
        "time_ms": 0,
        "event_type": "session_start",
        "activity_id": curr_activity,
        "response_latency_ms": None,
        "prompt_count": 0,
        "accuracy": None,
        "touch_x": None,
        "touch_y": None,
        "pause_before_action_ms": None,
        "visual_features": {"is_valid": False, "face_present": False, "head_pose_yaw": 0.0, "head_pose_pitch": 0.0}
    })

    # Pick 1 or 2 distinct decrease onset episodes in the session
    # (e.g. at ~120s and ~220s)
    onset_1 = int(np.random.uniform(90, 140)) * 1000
    decrease_duration_1 = int(np.random.uniform(25, 45)) * 1000
    decrease_end_1 = onset_1 + decrease_duration_1

    # Intervention happens near end of decrease
    interv_time = decrease_end_1 - int(np.random.uniform(3, 8)) * 1000
    interventions.append({
        "session_id": session_id,
        "time_ms": interv_time,
        "intervention_type": "verbal_prompt_and_redirect",
        "initiator": "teacher",
        "impact": "state_reset"
    })

    # Optional self-regulation period around 60s (NOT disengagement)
    reg_start = 55000
    reg_end = 75000

    # 1. Generate 5-second Educator Annotation Windows
    for t_win in range(0, total_ms, 5000):
        w_start = t_win
        w_end = min(t_win + 5000, total_ms)

        # Check if window intersects decrease onset
        is_onset = int(w_start <= onset_1 < w_end)

        if onset_1 <= w_start < decrease_end_1:
            state = "PASSIVE_DECREASE"
        elif reg_start <= w_start < reg_end:
            state = "REGULATING"
        else:
            state = "ACTIVE"

        annotations.append({
            "session_id": session_id,
            "start_time_ms": w_start,
            "end_time_ms": w_end,
            "state_label": state,
            "is_onset": is_onset,
            "annotator_id": "ANN_01",
            "uncertainty": 0,
            "notes": "Simulated timeline record"
        })

    # 2. Generate Discrete Interaction Events
    curr_time = 2000
    prompt_count = 0

    while curr_time < total_ms - 3000:
        # Determine current regime
        in_decrease = (onset_1 <= curr_time < decrease_end_1)
        in_regulating = (reg_start <= curr_time < reg_end)

        if in_decrease:
            # Significant delay, wandering pauses, or no touch
            pause_time = int(np.random.uniform(4000, 9000))
            latency = int(np.random.uniform(5000, 11000))
            accuracy = 0 if np.random.rand() < 0.6 else 1
            if np.random.rand() < 0.4:
                prompt_count += 1
        elif in_regulating:
            # Child is taking a breathing/motor regulation break: longer pause but no errors
            pause_time = int(np.random.uniform(3000, 6000))
            latency = int(np.random.uniform(2500, 4500))
            accuracy = 1
        else:
            # Normal active baseline
            pause_time = int(np.random.uniform(800, 2200))
            latency = int(np.random.uniform(1200, 2800))
            accuracy = 1 if np.random.rand() < 0.85 else 0

        # Stimulus event
        events.append({
            "learner_id": learner_id,
            "session_id": session_id,
            "time_ms": curr_time,
            "event_type": "stimulus_presented",
            "activity_id": curr_activity,
            "response_latency_ms": None,
            "prompt_count": prompt_count,
            "accuracy": None,
            "touch_x": None,
            "touch_y": None,
            "pause_before_action_ms": pause_time,
            "visual_features": None
        })

        # Touch event
        touch_time = curr_time + latency
        if touch_time >= total_ms:
            break

        events.append({
            "learner_id": learner_id,
            "session_id": session_id,
            "time_ms": touch_time,
            "event_type": "response",
            "activity_id": curr_activity,
            "response_latency_ms": latency,
            "prompt_count": prompt_count,
            "accuracy": accuracy,
            "touch_x": round(float(np.random.uniform(0.1, 0.9)), 3),
            "touch_y": round(float(np.random.uniform(0.2, 0.8)), 3),
            "pause_before_action_ms": pause_time,
            "visual_features": {
                "is_valid": True,
                "face_present": True if not in_decrease else (np.random.rand() > 0.4),
                "head_pose_yaw": round(float(np.random.normal(0, 10 if not in_decrease else 25)), 2),
                "head_pose_pitch": round(float(np.random.normal(0, 8)), 2)
            }
        })

        curr_time = touch_time + int(np.random.uniform(500, 1500))

    # Session end
    events.append({
        "learner_id": learner_id,
        "session_id": session_id,
        "time_ms": total_ms,
        "event_type": "session_end",
        "activity_id": curr_activity,
        "response_latency_ms": None,
        "prompt_count": prompt_count,
        "accuracy": None,
        "touch_x": None,
        "touch_y": None,
        "pause_before_action_ms": None,
        "visual_features": None
    })

    return events, pd.DataFrame(annotations), pd.DataFrame(interventions)


def main():
    parser = argparse.ArgumentParser(description="Generate sample interaction sessions.")
    parser.add_argument("--num_learners", type=int, default=3, help="Number of learners")
    parser.add_argument("--sessions_per_learner", type=int, default=2, help="Sessions per learner")
    parser.add_argument("--session_length_sec", type=int, default=240, help="Session duration in seconds")
    parser.add_argument("--output_dir", type=str, default="data/synthetic", help="Output directory")

    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    session_count = 0
    for l_idx in range(1, args.num_learners + 1):
        learner_id = f"L{l_idx:03d}"
        for s_idx in range(1, args.sessions_per_learner + 1):
            session_id = f"S_{learner_id}_{s_idx:02d}"
            seed = l_idx * 100 + s_idx

            events, ann_df, int_df = generate_session(
                learner_id=learner_id,
                session_id=session_id,
                session_length_sec=args.session_length_sec,
                seed=seed
            )

            # Save events JSONL
            events_path = os.path.join(args.output_dir, f"raw_events_{session_id}.jsonl")
            with open(events_path, "w", encoding="utf-8") as f:
                for ev in events:
                    f.write(json.dumps(ev) + "\n")

            # Save annotations CSV
            ann_path = os.path.join(args.output_dir, f"annotations_{session_id}.csv")
            ann_df.to_csv(ann_path, index=False)

            # Save interventions CSV
            int_path = os.path.join(args.output_dir, f"interventions_{session_id}.csv")
            int_df.to_csv(int_path, index=False)

            session_count += 1
            print(f"[generate_sample] Generated {session_id} ({len(events)} events, {len(ann_df)} annotation windows)")

    print(f"\n[generate_sample] Total generated: {session_count} sessions across {args.num_learners} learners in {args.output_dir}")


if __name__ == "__main__":
    main()
