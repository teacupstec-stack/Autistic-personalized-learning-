# C2 Component — Learning Personalisation (SCPA Bandit)

## Status: Full Implementation Complete

The C2 Constrained Activity Selection component is fully implemented, trained, and evaluated.

### Implemented Components
1. **Activity Bank (`content/activities.json`)**: 12 teacher-approved counting variants across 2 difficulty levels (`easy`, `medium`) and 2 presentation formats (`visual`, `text`).
2. **Learner Simulator (`sim/simulator.py`)**: Multi-family response generator (Additive Skill, Threshold Mastery, Fatigue/Recovery), generating context snapshots, C3 affective risk signals, break requests, and conservative skill updates.
3. **Dataset & Split Generation (`data/generate_dataset.py`)**: 70 simulated profiles across Train (40), Validation (10), and Held-Out Test (20) splits with `split_manifest.csv`.
4. **Context Neural Response Encoder (`models/model.py`, `train/train_response.py`)**: 32→16 ReLU MLP encoder trained via Binary Cross-Entropy with validation early stopping and strict train-only normalization (`models/preprocessing.json`, `models/model_weights.json`).
5. **SCPA Bandit Policy & Baselines (`policy/policy.py`, `policy/baselines.py`)**: Masked Thompson Sampling over Bayesian linear action heads, Educator Rules heuristic, Fixed Sequencing, and Ablations.
6. **Policy Evaluation Harness (`eval/evaluate_policy.py`)**: Evaluates policies on 20 held-out test profiles, reporting cumulative reward (with 95% bootstrap CI), constraint violations (strictly 0), regret, and failure sequences (`eval/metrics.json`).
7. **Model Export (`models/export_onnx.py`)**: Generates browser-ready model definition (`models/browser_model.json`).
8. **Interactive User-Flow Demo (`demo.py`)**: Live demonstration of teacher setup, student learning, break bypass, and safety escalation.
9. **Contract Validation Gate (`contracts/`)**: Dual Python/TypeScript schemas and validators with 45 test fixtures and 6 linked pairs.

---

## Quickstart: Run the Complete Pipeline

Run the entire pipeline (data generation, training, policy evaluation, export, and demo) with a single command:

```sh
python3 run_all.py
```

---

## Step-by-Step Execution

### 1. Generate Dataset & Splits
```sh
python3 data/generate_dataset.py
```
Outputs: `data/raw/train_episodes.json`, `data/raw/val_episodes.json`, `data/raw/test_episodes.json`, and `data/splits/split_manifest.csv`.

### 2. Train Neural Response Encoder
```sh
python3 train/train_response.py
```
Outputs: `models/preprocessing.json`, `models/model_weights.json`, `models/labels.json`, and `models/training_summary.json`.

### 3. Evaluate Policies on Held-Out Test Profiles
```sh
python3 eval/evaluate_policy.py
```
Compares Fixed Sequencing, Educator Rules, Linear Bandit, and SCPA Bandit (with and without confidence-weighted C3 signals) on unseen response families. Outputs: `eval/metrics.json`.

### 4. Export Model for Browser / ONNX Runtime
```sh
python3 models/export_onnx.py
```
Outputs: `models/browser_model.json`.

### 5. Run Live User-Flow Presentation Demo
```sh
python3 demo.py
```

---

## Research Safeguards & Invariants
* **Teacher Limits**: The policy strictly selects from `teacher_limits.allowed_actions` which must be a subset of `approved_actions`. Constraint violations = 0.
* **Break Policy**: Break requests bypass selection entirely; no decision event is generated and no reward penalty is applied.
* **Stale Signals**: Expired C3 signals resolve to `null` (`unknown`), never assumed to be 0 risk.
* **Anti-Leakage**: Preprocessing normalization is fit strictly on training splits. Test profiles use unseen response mechanics.
