"""
Master End-to-End Pipeline for C2 Personalisation Component.
Executes:
1. Content Bank Verification
2. Dataset Generation across 70 Profiles
3. Context Neural Response Encoder Training
4. Multi-Policy Evaluation on Held-Out Test Profiles
5. Model Export for Browser/ONNX Runtime
6. Interactive System Demo
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import data.generate_dataset as gen_data
import data.public_benchmark as public_mod
import train.train_response as train_mod
import eval.evaluate_policy as eval_mod
import models.export_onnx as export_mod
import demo as demo_mod

CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_banner(step_num: int, title: str):
    print("\n" + "=" * 75)
    print(f"{BOLD}{CYAN}[PHASE {step_num}] {title}{RESET}")
    print("=" * 75)

def main():
    start_total = time.time()
    print("\n" + "#" * 75)
    print(f"{BOLD}{GREEN}  C2 CONSTRAINED ACTIVITY SELECTION: COMPLETE SYSTEM PIPELINE{RESET}")
    print(f"  Component 2: SCPA Bandit & Context Personalisation")
    print("#" * 75)

    # 1. Content Bank
    print_banner(1, "Verifying Teacher-Approved Activity Bank")
    activities_file = ROOT / "content/activities.json"
    if activities_file.exists():
        import json
        with open(activities_file) as f:
            acts = json.load(f)
        print(f"  {GREEN}✔ Verified {len(acts)} teacher-approved counting variants in content/activities.json{RESET}")
    else:
        print("  Error: activities.json missing.")

    # 2. Dataset Generation
    print_banner(2, "Generating Simulated Dataset & Partitioning Splits")
    gen_data.main()

    # 3. Public Dataset Benchmark
    print_banner(3, "Evaluating Public Dataset Benchmark (EdNet KT1)")
    public_mod.main()

    # 4. Model Training
    print_banner(4, "Training Context-only Neural Response Encoder")
    train_mod.main()

    # 5. Policy Evaluation
    print_banner(5, "Evaluating Policies on Held-Out Profiles (Unseen Families)")
    eval_mod.main()

    # 6. Model Export
    print_banner(6, "Exporting Model for Browser & ONNX Web Runtime")
    export_mod.export_to_onnx()

    # 7. Interactive Demo
    print_banner(7, "Executing Interactive Classroom User-Flow Demo")
    demo_mod.run_demo()

    elapsed = round(time.time() - start_total, 2)
    print("\n" + "#" * 75)
    print(f"{BOLD}{GREEN}  PIPELINE EXECUTION COMPLETE IN {elapsed}s{RESET}")
    print(f"  All models trained, evaluated, and saved to disk.")
    print("#" * 75 + "\n")

if __name__ == "__main__":
    main()
