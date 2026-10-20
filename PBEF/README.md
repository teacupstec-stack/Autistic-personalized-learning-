# Component 3: Participation Forecasting (PBEF)

> **Personalized Behavioral and Educational Framework (PBEF) — Component 3**  
> *Camera-Free, Real-Time Participation Forecasting & Educator Decision Support Platform*  
> **Target Date:** October 2026 | **Author:** Component Owner

---

## 1. Executive Summary & Purpose

Component 3 (PBEF) continuously forecasts an impending **decrease in task participation** within the upcoming **20 seconds** using strictly **camera-free interaction dynamics** across a rolling **30-second observation window**.

Designed specifically for neurodiverse autistic learners on interactive learning tablets, the system adheres to strict ethical non-diagnostic boundaries:
- **Zero Sensor / Camera Intrusion:** Operates purely on behavioral interaction dynamics (touch pacing, response latency, and hesitation/pause duration).
- **Zero Student-Facing Alarms:** Risk scores, alerts, and advisories are presented exclusively to the educator. The student experience remains calm, positive, and uninterrupted.
- **Teacher Advisory Boundary:** The AI forecaster never unilaterally overrides the student or triggers automated interruptions. It serves as an advisory copilot, leaving all pedagogical decisions (breaks, hints, question difficulty) in the hands of the educator.

---

## 2. System Architecture

The platform consists of an authentic end-to-end learning environment paired with real-time browser-based neural forecasting:

```
+---------------------------------------------------------------------------------------------------+
|                                  STUDENT TABLET VIEW (Left)                                       |
|  - Math Pattern Discovery (Grade 4)                                                               |
|  - Real-time touch, selection, latency, and pause capture (SessionEventLogger)                    |
|  - Dynamic Pedagogical Scaffolding:                                                               |
|      • 🌿 2-minute restorative calming break (breathing pulse animation + countdown)              |
|      • 🧩 Scaffolded easier pattern questions                                                     |
|      • 💡 Teacher-delivered hints                                                                 |
|      • 💭 Student self-regulation thinking pause ("I'm Thinking")                                 |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼ Monotonic Telemetry Stream
+---------------------------------------------------------------------------------------------------+
|                           CAUSAL FEATURE ADAPTER & BASELINE NORMALIZER                            |
|  - Rolling 30-second causal window [t - 30s, t)                                                   |
|  - Channel 0: perf_counts (interaction count in each 1-second bin)                                |
|  - Channel 1: inactivity (seconds elapsed since last interaction in each bin)                     |
|  - Input Tensor: [1, 2, 30] (60 floats) normalized against personal baseline                      |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                          DUAL-ENGINE NEURAL INFERENCE RUNTIME                                     |
|  - Model: TemporalForecaster_InteractionOnly_ModeB (2-layer TCN + AdaptivePool + FC Heads)        |
|  - Backend 1: ONNX Runtime Web (WASM execution)                                                   |
|  - Backend 2: Fused TCN Forward Engine (BatchNorm folded into Conv1D, zero-dependency TS)         |
|  - Relative Risk: Calibrated against active baseline (starts from 0%, drops to 0% when active)    |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼ Continuous 1 Hz Advisory Stream
+---------------------------------------------------------------------------------------------------+
|                                TEACHER ADVISORY MONITOR (Right)                                   |
|  - Live Participation Risk Gauge (0% – 100%, threshold at 30%)                                     |
|  - Real-time Observational Evidence (Idle time, action frequency, response latency)               |
|  - Alert State Machine: 3 consecutive predictions >= 30% -> Advisory Banner                       |
|  - Pedagogical Decision Support Modal (Opens on 'Review & Decide' click):                         |
|      1. 🌿 Offer a 2-minute break                                                                 |
|      2. 🧩 Switch to an easier question                                                           |
|      3. 💡 Send a hint                                                                            |
|      4. ✓ Alex is just thinking — continue (quiet observation cooldown)                           |
|  - Session Controls: Pause / Resume Session & Reset                                               |
|  - Full Chronological Review Log & About Tab                                                      |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Key Features & Implementation Details

### 3.1 Actual Neural Network Forecaster (Zero Hardcoded Scripts)
- Operates directly via `forwardTcn()` and ONNX graph `model.onnx`.
- Inputs are strict `[1, 2, 30]` tensor slices from the monotonic session logger.
- When the student is actively interacting (e.g. 182 touches in 30s, 0s idle), the convolutional layers detect high interaction pacing and zero inactivity, driving the forecast logit negative and bringing the risk to **0%**.
- When the student pauses for > 15s without interaction, the inactivity gradient increases the forecast logit, cleanly elevating the risk across the **30% advisory threshold** (reaching ~42% at 18.2s).

### 3.2 Non-Disruptive Teacher Alert Flow
- When risk exceeds 30% for 3 consecutive seconds, an advisory banner appears in the teacher view:  
  `Attention — Alex may need support · Idle time: Xs · Risk: Y% [Review & Decide] [Just Thinking]`
- **No intrusive popups:** The options modal is shown **only** when the educator explicitly clicks `Review & Decide`.
- The student's screen is **never** interrupted with warning dialogs or sound alarms.

### 3.3 Session Pause & Resume
- The educator can pause the entire session at any time (`⏸️ Pause Session`).
- Pausing freezes the clock and telemetry, stopping idle time from falsely accumulating during teacher discussions.
- Resuming (`▶️ Resume Session`) smoothly restarts the session clock and continuous inference.

### 3.4 Live Connected Pedagogical Interventions
- **🌿 2-Minute Calming Break:** Triggers a soothing nature-inspired screen on the student's tablet with an animated breathing circle ("Inhale gently... hold... exhale slowly") and countdown timer. Student can click *"I'm Ready to Continue Learning"* at any time.
- **🧩 Switch to Easier Question:** Automatically swaps the pattern for an accessible scaffold (e.g. counting by 2s: `2, 4, 6, 8, [?]`) to rebuild confidence and clears previous error banners.
- **💡 Send a Hint:** Unlocks the hint card automatically with a teacher badge (*"💡 Your teacher sent a helpful hint"*).
- **✓ Just Thinking:** Dismisses the advisory and applies an observation cooldown, giving the learner cognitive space without nagging.

---

## 4. Quick Start & Setup

### Prerequisites
- **Python (3.10+)**
- **Node.js (v18+)** and npm

---

### Phase 1: Python Environment Setup

```bash
# Navigate to the PBEF root
cd e:\Autistic-personalized-learning-\PBEF

# Create and activate virtual environment
python -m venv .venv

# On Windows PowerShell:
.venv\Scripts\Activate.ps1
# On Windows CMD:
# .venv\Scripts\activate.bat
# On Linux/macOS:
# source .venv/bin/activate

# Upgrade pip and install all Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# (Optional - for NVIDIA GPU / CUDA acceleration):
# If using Python 3.13 with NVIDIA GeForce RTX GPUs (CUDA 12.4+):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 --force-reinstall
```

---

### Phase 2: Engagnition Clinical Dataset Pipeline & Model Training

With the `data/engagnition` dataset folder in place:

#### 1. Ingest & Build Causal 30s/20s Windows
```bash
# Inspect and audit raw dataset
python src/data/engagnition_adapter.py --inspect

# Extract strictly non-leaking, causal 30s observation / 20s forecast windows
python src/data/engagnition_adapter.py --build_windows
```
*Outputs:* `data/engagnition/engagnition_windows.npz` and `engagnition_window_manifest.csv`.

#### 2. Train Mode B Dedicated Interaction Forecaster (Camera-Free)
Trains the production 2-channel temporal forecaster (hit pacing + pause duration):
```bash
python src/models/train_interaction_forecaster.py
```
*Outputs:*
- `models/interaction_forecaster/model.pt` (PyTorch weights)
- `models/interaction_forecaster/model.onnx` (ONNX graph)
- `models/interaction_forecaster/metrics.json`

#### 3. Deploy ONNX Model to Web Application
Copy the newly trained ONNX graph to the Vite public assets:
```powershell
# PowerShell:
Copy-Item models\interaction_forecaster\model.onnx app\public\models\interaction_forecaster\model.onnx -Force
```

#### 4. Run Head-to-Head Clinical Benchmark on Engagnition
```bash
python src/models/benchmark_engagnition.py
```
*Outputs:* `results/metrics/engagnition_benchmark.csv` and `engagnition_event_metrics.json`.

---

### Phase 3: Synthetic Dataset Pipeline & Verification Audit

To run the complete verification suite and baseline benchmark:
```bash
# Option A: One-command master audit
python verify_all.py

# Option B: Run steps individually
python tests/test_pipeline.py
python src/features/build_windows.py --aligned_dir data/synthetic --output_dir data/synthetic
python src/models/run_benchmark_comparison.py
python src/models/export_onnx.py
python scripts/demo_heldout_window.py
```

---

### Phase 4: Frontend (Web Application) Setup & Execution

```bash
# Navigate to the app directory
cd app

# Install dependencies (if not already done)
npm install

# Run unit tests & TypeScript verification
npm test
npm run type-check

# Launch the live platform
npm run dev
```
Open **http://localhost:5173** in your web browser.

---

## 5. Repository Structure

```
PBEF/
├── app/                               # React + Vite + ONNX Runtime Web platform
│   ├── public/
│   │   └── models/
│   │       └── interaction_forecaster/
│   │           ├── model.onnx         # ONNX graph served to browser runtime
│   │           └── config.json        # Tensor dimensions & threshold
│   ├── src/
│   │   ├── App.tsx                    # Main educator dashboard & dual-view interface
│   │   ├── StudentQuestionActivity.tsx# Student learning task & support action views
│   │   ├── event_logger.ts            # Monotonic millisecond interaction logger
│   │   ├── services/
│   │   │   ├── modelInference.ts      # Dual ONNX WASM & Fused TCN execution engine
│   │   │   ├── tcnWeights.ts          # Folded convolutional neural network weights
│   │   │   ├── eventFeatureAdapter.ts # Causal window extractor & baseline scaler
│   │   │   ├── forecastClient.ts      # Client forecasting service
│   │   │   └── alertEngine.ts         # Educator advisory state machine
│   │   └── tests/                     # Unit tests for client logger & adapter
│   └── package.json
├── configs/                           # Model configuration YAMLs
├── data/
│   ├── engagnition/                   # Nature Scientific Data (2024) Clinical Cohort
│   │   ├── raw/                       # Raw Excel & CSV interaction, physio, and annotations
│   │   ├── engagnition_windows.npz    # Extracted causal 30s/20s tensor windows
│   │   └── engagnition_window_manifest.csv # Metadata per extracted window
│   └── synthetic/                     # Synthetic test fixtures & manifests
├── docs/                              # Model contracts, schemas & protocols
├── models/
│   ├── interaction_forecaster/        # Mode B interaction-only checkpoints & ONNX
│   └── tcn_forecaster/                # Full multimodal TCN checkpoints & ONNX
├── results/
│   └── metrics/                       # Benchmark CSVs, PR-AUC, ROC-AUC, and event metrics
├── scripts/
│   ├── demo_heldout_window.py         # Live streaming simulation on held-out learner
│   └── run_audit_followup.py          # Metric audit reporter
├── src/
│   ├── data/
│   │   └── engagnition_adapter.py     # Causal Engagnition dataset ingestion
│   ├── features/
│   │   ├── align_annotations.py       # Event-annotation alignment
│   │   └── build_windows.py           # Sliding window extractor
│   ├── models/
│   │   ├── train_interaction_forecaster.py # Trains Mode B interaction-only forecaster
│   │   ├── train_forecaster.py        # Trains multimodal TCN with reliability gate
│   │   ├── benchmark_engagnition.py   # Engagnition clinical benchmark
│   │   ├── run_benchmark_comparison.py# 7-model head-to-head comparison
│   │   └── export_onnx.py             # ONNX export and parity check
│   └── evaluation/
│       └── evaluate_events.py         # Discrete event-level advance warning evaluator
├── tests/
│   └── test_pipeline.py               # Python unit and integration test suite
├── verify_all.py                      # Master technical verification audit script
├── verify_all.ps1                     # Safe PowerShell audit runner
└── requirements.txt                   # Python dependencies
```

---

## 6. Research & Clinical Context

- **Dataset:** Formulated and validated against the Nature Scientific Data (2024) multimodal Engagnition autistic cohort ($N=57$ autistic children, 38 experimental participants).
- **Ethical Integrity:** Strictly avoids affective diagnostic claims. All telemetry is restricted to defensible, observable human-computer interactions.
