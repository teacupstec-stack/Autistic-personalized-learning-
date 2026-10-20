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
- Node.js (v18+)
- npm or yarn

### Installation
```bash
# Navigate to the app directory
cd app

# Install dependencies
npm install
```

### Running the Live Platform
```bash
npm run dev
```
Open **http://localhost:5173** in your web browser.

### Verification & Testing
```bash
# Run the complete client-side unit test suite
npm test

# Run TypeScript type check
npm run type-check

# Build production bundle
npm run build
```

---

## 5. Repository Structure

```
PBEF/
├── app/
│   ├── src/
│   │   ├── App.tsx                    # Main educator dashboard & dual-view interface
│   │   ├── StudentQuestionActivity.tsx# Student learning task & support action views
│   │   ├── event_logger.ts            # Monotonic millisecond interaction logger
│   │   ├── services/
│   │   │   ├── modelInference.ts      # Dual ONNX WASM & Fused TCN execution engine
│   │   │   ├── tcnWeights.ts          # Folded convolutional neural network weights
│   │   │   ├── eventFeatureAdapter.ts # Causal window extractor & baseline scaler
│   │   │   ├── forecastClient.ts      # Client forecasting service
│   │   │   ├── alertEngine.ts         # Educator advisory state machine
│   │   │   └── eventMapping.ts        # Event mapping to standard telemetry contract
│   │   ├── tests/
│   │   │   └── run_all.ts             # Client-side unit test master runner
│   │   └── types/
│   │       └── participation.ts       # TypeScript contract types
│   └── package.json
├── data/                              # Clinical Engagnition dataset & synthetic fixtures
├── docs/
│   ├── MODEL_CONTRACT.md              # Input/output tensor schemas & warmup rules
│   └── OBSERVABLE_LABELS.md           # Observational criteria & protocol
├── models/                            # PyTorch checkpoints and ONNX graphs
└── README.md                          # Platform documentation (this file)
```

---

## 6. Research & Clinical Context

- **Dataset:** Formulated and validated against the Nature Scientific Data (2024) multimodal Engagnition autistic cohort.
- **Ethical Integrity:** Strictly avoids affective diagnostic claims. All telemetry is restricted to defensible, observable human-computer interactions.
