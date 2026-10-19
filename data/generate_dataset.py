"""
Generate training, validation, and held-out test datasets using the simulator.
Produces partitioned episode logs and a split manifest.
"""
import csv
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sim.simulator import LearnerProfile, LearnerSimulator, CANONICAL_ACTIONS
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
SPLITS_DIR = DATA_DIR / "splits"

def uniform_random_policy(snapshot, eligible_actions):
    """Uniform random exploration over strictly eligible actions."""
    if not eligible_actions:
        return None
    return random.choice(eligible_actions)

def generate_profiles(split_name: str, count: int, start_seed: int, family: str):
    profiles = []
    rng = random.Random(start_seed)
    for i in range(count):
        seed = start_seed + i
        profile_id = f"sim_{split_name}_{i+1:03d}"
        starting_skill = round(rng.uniform(0.20, 0.75), 3)
        learning_rate = round(rng.uniform(0.015, 0.045), 3)
        visual_pref = round(rng.uniform(-0.35, 0.35), 3)
        break_tend = round(rng.uniform(0.03, 0.08), 3)
        distress_th = round(rng.uniform(0.65, 0.85), 3)

        p = LearnerProfile(
            profile_id=profile_id,
            family=family,
            starting_skill=starting_skill,
            learning_rate=learning_rate,
            visual_preference=visual_pref,
            break_tendency=break_tend,
            distress_threshold=distress_th,
            seed=seed
        )
        profiles.append(p)
    return profiles

def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    SPLITS_DIR.mkdir(parents=True, exist_ok=True)

    print("Generating simulated profiles and datasets...")

    # 1. Profile Definition
    train_profiles = generate_profiles("train", 40, 101, "additive_skill")
    val_profiles = generate_profiles("val", 10, 201, "additive_skill")
    # Test split uses unseen response families
    test_p1 = generate_profiles("test_thresh", 10, 301, "threshold_mastery")
    test_p2 = generate_profiles("test_fatigue", 10, 311, "fatigue_recovery")
    test_profiles = test_p1 + test_p2

    splits = [
        ("train", train_profiles, 5, 25), # 40 profiles * 5 sessions * 25 steps = 5,000 steps
        ("val", val_profiles, 5, 20),     # 10 profiles * 5 sessions * 20 steps = 1,000 steps
        ("test", test_profiles, 5, 25)    # 20 profiles * 5 sessions * 25 steps = 2,500 steps
    ]

    manifest_rows = []

    for split_name, profiles, num_sessions, steps_per_session in splits:
        all_records = []
        for p in profiles:
            sim = LearnerSimulator(p)
            for s_idx in range(num_sessions):
                session_id = f"sess_{p.profile_id}_{s_idx+1}"
                session_seed = p.seed * 1000 + s_idx
                records = sim.run_session(
                    session_id=session_id,
                    num_steps=steps_per_session,
                    policy_fn=uniform_random_policy,
                    session_seed=session_seed
                )
                all_records.extend(records)

            manifest_rows.append({
                "profile_id": p.profile_id,
                "family": p.family,
                "split": split_name,
                "seed": p.seed,
                "starting_skill": p.starting_skill,
                "sessions": num_sessions,
                "steps_per_session": steps_per_session
            })

        output_file = RAW_DIR / f"{split_name}_episodes.json"
        with open(output_file, "w") as f:
            json.dump(all_records, f, indent=2)
        print(f"  Saved {len(all_records)} interaction records for '{split_name}' -> {output_file.name}")

    # Write split manifest
    manifest_path = SPLITS_DIR / "split_manifest.csv"
    with open(manifest_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "profile_id", "family", "split", "seed", "starting_skill", "sessions", "steps_per_session"
        ])
        writer.writeheader()
        writer.writerows(manifest_rows)
    print(f"  Split manifest written -> {manifest_path.name}")
    print("Dataset generation complete.\n")

if __name__ == "__main__":
    main()
