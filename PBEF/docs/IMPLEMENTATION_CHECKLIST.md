# Component 3: Participation Forecasting (PBEF) — Implementation Checklist & Progress Log

**Component:** Component 3 (Participation Forecasting - PBEF)  
**Target Milestone:** PP1 Preparation & Defense (October 2026)  
**Tracking Status:** Active Progress Log  
**Current Completion:** 17 of 18 Tasks Completed (Milestones 1–5 Complete; Milestone 6 Final Polish & PP1 Viva Rehearsal)

---

## Progress Overview Dashboard

| Milestone | Stage | Planned Timing | Tasks | Status | Completion |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Milestone 1** | Environment & Project Structure | Day 1 | 3 | **COMPLETED** | 100% (3/3) |
| **Milestone 2** | Event Logger & Annotation Guide | Days 2–4 | 3 | **COMPLETED** | 100% (3/3) |
| **Milestone 3** | Data Alignment & Window Generation | Week 1 | 3 | **COMPLETED** | 100% (3/3) |
| **Milestone 4** | Baseline Training | Week 2 | 3 | **COMPLETED** | 100% (3/3) |
| **Milestone 5** | Temporal Deep Learning (TCN) | Weeks 3–4 | 3 | **COMPLETED** | 100% (3/3) |
| **Milestone 6** | Integration, Evaluation & PP1 Viva | Weeks 5 onward | 3 | **IN PROGRESS** | 66% (2/3) |

---

## Detailed Task Checklist (18 Tasks)

### Milestone 1 — Environment and Project Structure (Day 1)
- [x] **Task 1.1: Set up Python Virtual Environment**
  - *Details:* Isolated `.venv` with Python 3.13.1, pinned package dependencies in `requirements.txt`.
  - *Deliverable:* `.venv` created and configured with NumPy, Pandas, Scikit-learn, PyTorch, Matplotlib, Seaborn, ONNX, and ONNX Runtime.
  - *Verification Date:* 2026-10-16
- [x] **Task 1.2: Create Project Folder Structure & Git Repository**
  - *Details:* Created structured directories (`data/raw`, `data/processed`, `data/synthetic`, `src/features`, `src/models`, `src/evaluation`, `app/src`, `configs`, `models`, `results`, `docs`, `tests`). Initialized Git repo and configured comprehensive `.gitignore`.
  - *Deliverables:* `.gitignore`, directory tree, `.git/`.
  - *Verification Date:* 2026-10-16
- [x] **Task 1.3: Verify Core Machine Learning Libraries**
  - *Details:* Validated library imports and CPU execution compatibility.
  - *Observed Versions:*
    - Python: `3.13.1`
    - NumPy: `2.5.4`
    - Pandas: `3.0.6`
    - Scikit-learn: `1.9.1`
    - PyTorch: `2.14.1+cpu`
    - ONNX: `1.23.2`
    - ONNX Runtime: `1.31.0`
    - Node.js: `v22.14.0`, npm: `10.9.2`, git: `2.45.1.windows.1`
  - *Verification Date:* 2026-10-16

---

### Milestone 2 — Event Logger and Annotation Guide (Days 2–4)
- [x] **Task 2.1: Define the Event Schema & Data Contract**
  - *Details:* Formalized schema for raw interaction events, educator annotations, teacher interventions, personal baseline calibration, and model inference outputs.
  - *Deliverables:* [`docs/DATA_CONTRACT.md`](file:///e:/PBEF/docs/DATA_CONTRACT.md).
  - *Verification Date:* 2026-10-16
- [x] **Task 2.2: Implement Timestamped Event Logging**
  - *Details:* TypeScript client event logger with monotonic clock tracking (`performance.now`), touch coordinates, response latency, prompt counting, idle detection, and camera validity masking.
  - *Deliverables:* [`app/src/event_logger.ts`](file:///e:/PBEF/app/src/event_logger.ts).
  - *Verification Date:* 2026-10-16
- [x] **Task 2.3: Define Observable Labels with Supervisor & Educator Guidance**
  - *Details:* Established non-punitive, observable behavioral criteria distinguishing task disengagement from self-regulation (`REGULATING`), processing pauses, and physical movement. Incorporated explicit `UNCERTAIN` label and 20% dual-annotation protocol. Built and verified full interactive React/TypeScript annotation suite with 5s segmented ribbon, micro-feature event inspector, keyboard shortcuts (`1-4`, `O`, `U`, `Space`, `Arrows`, `Enter`), JSONL/CSV importers, CSV exporter, and Cohen's Kappa agreement calculator.
  - *Deliverables:* [`docs/OBSERVABLE_LABELS.md`](file:///e:/PBEF/docs/OBSERVABLE_LABELS.md), [`app/src/annotation_tool.tsx`](file:///e:/PBEF/app/src/annotation_tool.tsx), [`app/package.json`](file:///e:/PBEF/app/package.json), [`app/tsconfig.json`](file:///e:/PBEF/app/tsconfig.json).
  - *Verification Date:* 2026-10-16 (Type check passed: 0 errors)

---

### Milestone 3 — Data Alignment and Window Generation (Week 1)
- [x] **Task 3.1: Create Sample Interaction Timelines & Verification Fixtures**
  - *Details:* Synthesize documented test fixtures with known onsets, self-regulation periods, and teacher interventions to verify temporal alignment without data leakage.
  - *Deliverable:* [`src/features/generate_sample_sessions.py`](file:///e:/PBEF/src/features/generate_sample_sessions.py).
  - *Verification Date:* 2026-10-16
- [x] **Task 3.2: Align Continuous Events with Synchronous Annotations**
  - *Details:* Aggregate asynchronous interactions into fixed 1-second bins (`time_bin_start_ms` to `time_bin_end_ms`) with associated response latencies, pause durations, prompt counts, and state labels.
  - *Deliverable:* [`src/features/align_annotations.py`](file:///e:/PBEF/src/features/align_annotations.py).
  - *Verification Date:* 2026-10-16
- [x] **Task 3.3: Generate Leakage-Safe 30-Second Sequence Windows**
  - *Details:* Sliced aligned timelines into strictly past 30-second history windows ($[t - 30\text{s}, t]$) paired with a 20-second future onset target ($[t, t + 20\text{s}]$). Enforced participant-level and session-level train/validation/test splits. Generated 1,146 total windows across 6 sessions (144 onset events, 1,026 valid windows).
  - *Deliverable:* [`src/features/build_windows.py`](file:///e:/PBEF/src/features/build_windows.py), `data/synthetic/windows.npz`, `data/synthetic/window_manifest.csv`.
  - *Verification Date:* 2026-10-16

---

### Milestone 4 — Baseline Training (Week 2)
- [x] **Task 4.1: Implement Deterministic Threshold-Rule Baseline**
  - *Details:* Heuristic decision rule based on response latency exceeding participant percentiles or idle pause duration. Baseline F1 achieved: `0.3191`.
  - *Deliverable:* [`src/models/train_logistic.py`](file:///e:/PBEF/src/models/train_logistic.py), `models/baseline/baseline_rules.json`.
  - *Verification Date:* 2026-10-16
- [x] **Task 4.2: Train Summary-Statistic Logistic Regression Baseline**
  - *Details:* Fit regularized logistic regression over aggregated 30s summary features (mean/max latency, trend slope, touch frequency, error count).
  - *Deliverable:* `models/baseline/baseline_logistic.pkl`.
  - *Verification Date:* 2026-10-16
- [x] **Task 4.3: Evaluate Baselines on Held-Out Forecasting Horizon**
  - *Details:* Computed PR-AUC (`0.2131`), ROC-AUC (`0.6759`), and F1 (`0.3347`) across held-out participant splits.
  - *Deliverable:* `models/baseline/baseline_metrics.json`.
  - *Verification Date:* 2026-10-16

---

### Milestone 5 — Temporal Deep Learning (Weeks 3–4)
- [x] **Task 5.1: Build Temporal Convolutional Network (TCN) Architecture**
  - *Details:* 2-layer 1D temporal convolution (32 channels) over 30s interaction history, optional visual encoder (16 channels), and multimodal reliability gate.
  - *Deliverable:* `TemporalForecaster` in [`src/models/train_forecaster.py`](file:///e:/PBEF/src/models/train_forecaster.py).
  - *Verification Date:* 2026-10-16
- [x] **Task 5.2: Dual-Head Training & Checkpoint Selection**
  - *Details:* Joint optimization of binary future-onset BCE loss and multi-class current-state CE loss with class weighting. Achieved Validation PR-AUC: `0.2898` - `0.3653`, ROC-AUC: `0.7460` - `0.7947`.
  - *Deliverable:* `models/tcn_forecaster/model.pt`, `models/tcn_forecaster/config.json`, `models/tcn_forecaster/metrics.json`.
  - *Verification Date:* 2026-10-16
- [x] **Task 5.3: Automated Test Verification & Pipeline Sanity**
  - *Details:* Built automated test suite covering event simulation, alignment, window building, baseline summaries, and forward pass.
  - *Deliverable:* [`tests/test_pipeline.py`](file:///e:/PBEF/tests/test_pipeline.py) (All 5 tests passing).
  - *Verification Date:* 2026-10-16

---

### Milestone 6 — Integration, Evaluation & PP1 Preparation (Weeks 5 onward)
- [x] **Task 6.1: Event-Level Alert Evaluation & False Alerts per Hour**
  - *Details:* Evaluated warnings with a 20s horizon matching rule, 15s cooldown suppression, and usable lead times. Measured event precision (`0.3409`), true positives, and lead time (`3.87s`).
  - *Deliverable:* [`src/evaluation/evaluate_events.py`](file:///e:/PBEF/src/evaluation/evaluate_events.py), `results/metrics/event_metrics.json`.
  - *Verification Date:* 2026-10-16
- [x] **Task 6.2: Export to ONNX & Browser Inference Parity**
  - *Details:* Exported PyTorch TCN to ONNX with dynamic batch axes; verified numerical equivalence with ONNX Runtime (`max abs diff = 5.96e-08`, diff < $10^{-4}$).
  - *Deliverable:* [`src/models/export_onnx.py`](file:///e:/PBEF/src/models/export_onnx.py), `models/tcn_forecaster/model.onnx`.
  - *Verification Date:* 2026-10-16
- [ ] **Task 6.3: Reproducible PP1 Viva Demonstration & Audit Trail**
  - *Details:* Final viva rehearsal, slide deck preparation, dataset transparency statement (clarifying synthetic vs real data boundaries), and failure mode defense.
  - *Deliverable:* `docs/PP1_DEMONSTRATION_GUIDE.md` and slide walkthrough.
  - *Target Date:* Prior to PP1 defense

