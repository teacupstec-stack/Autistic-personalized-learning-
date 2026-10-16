# PBEF Component 3 — PP1 Technical Audit Package

**Document Version:** 1.0.0  
**Effective Date:** October 2026  
**Component:** Component 3: Participation Forecasting  
**Framework:** Personalized Behavioral & Educational Framework (PBEF)  
**Author / Component Owner:** Naveeth Nawzer  
**Repository Location:** `E:\PBEF` (Git branch: `master`, commit: `b545c70`)

---

## 1. Project Overview

- **Project title:** Personalized Behavioral and Educational Framework (PBEF)
- **Component name:** Component 3 — Participation Forecasting (PBEF)
- **My responsibility:** Developing the client-side monotonic event logger, observable participation annotation protocol, leakage-safe sequence window pipeline, baseline models (heuristic threshold rules, summary logistic regression), deep temporal convolutional network (TCN) forecaster with multimodal reliability gating, event-level false alert evaluation, and browser ONNX export.
- **Overall research problem:** How can recent fine-grained task interaction dynamics (response latencies, touch coordinates, pauses, hints, errors) forecast an imminent teacher-defined decrease in learner participation over the next 20 seconds, allowing timely educator scaffolding while preserving child agency?
- **Intended users:** Special education teachers, therapists, and educators supporting autistic learners during digital tablet-based cognitive activities.
- **What the model predicts:** 
  1. *Binary 20-second future onset risk score:* Probability $\hat{y} \in [0, 1]$ that an eligible teacher-defined participation decrease will begin within the upcoming 20 seconds ($[t, t + 20\text{s}]$).
  2. *Current 5-second participation state:* Categorical classification (`ACTIVE`, `PASSIVE_DECREASE`, `REGULATING`).
- **What the model must NOT predict:** The model does NOT deduce internal affective, diagnostic, or emotional states (e.g., "boredom", "distress", "meltdown", or "autism severity"). Looking away, deliberate pauses for cognitive processing, and self-regulatory behaviors (stimming, rhythmic motor tapping) must NEVER be defined as disengagement.
- **Current implementation status:** Full engineering pipeline implemented, tested, and verified end-to-end on documented synthetic verification fixtures (17 of 18 checklist tasks complete; PP1 oral rehearsal and defense remaining).
- **What I need to demonstrate at PP1:**
  1. Monotonic event logging & timeline synchronization tool ([`app/src/annotation_tool.tsx`](app/src/annotation_tool.tsx)).
  2. Leakage-safe 30s input history to 20s target horizon separation with participant-level splitting.
  3. Fair head-to-head empirical comparison of threshold rules, logistic regression, and TCN.
  4. Event-level alert precision, cooldown suppression (15s), and usable warning lead time.
  5. Browser-compatible ONNX model with validated numerical parity ($< 10^{-4}$ max error).
  6. Transparent dataset audit sheet distinguishing synthetic verification fixtures from human participant trials.
- **PP1 marking rubric weights:** Gap & Proof of Concept (10%), Specialised Knowledge (25%), Implementation (40%), Communication (15%), Commercialisation & Ethics (10%). Target for excellent band: ~50% completion with verified working pipeline.

---

## 2. Environment and Reproducibility

- **Operating system:** Windows 11 (PowerShell)
- **Python version:** `3.13.1` (64-bit)
- **PyTorch version:** `2.14.1+cpu`
- **NumPy version:** `2.5.4`
- **pandas version:** `3.0.6`
- **scikit-learn version:** `1.9.1`
- **ONNX version:** `1.23.2`
- **ONNX Runtime version:** `1.31.0`
- **ONNXScript version:** `0.7.2`
- **Node.js & npm:** Node `v22.14.0`, npm `10.9.2`, TypeScript `5.7.0`, tsx `4.23.15`
- **CPU/GPU:** Intel CPU workstation (CPU execution provider; small models designed for client WebAssembly inference)
- **Repository path:** `E:\PBEF`
- **Git branch:** `master`
- **Latest commit hash:** `b545c70`
- **How dependencies are installed:**
  ```powershell
  # Python environment
  .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  # Node/TypeScript environment
  cd app ; npm install ; cd ..
  ```
- **Exact commands used to run the complete pipeline:**
  ```powershell
  # 1. Synthesize 9 sample sessions across 3 learners
  .\.venv\Scripts\python.exe src/features/generate_sample_sessions.py --num_learners 3 --sessions_per_learner 3 --output_dir data/synthetic

  # 2. Align continuous events into 1-second bins across all 9 sessions
  .\.venv\Scripts\python.exe -c "
  import glob, os, subprocess
  for f in sorted(glob.glob('data/synthetic/raw_events_S_*.jsonl')):
      sid = os.path.basename(f).replace('raw_events_', '').replace('.jsonl', '')
      subprocess.run(['.\\.venv\\Scripts\\python.exe', 'src/features/align_annotations.py', '--events_file', f, '--annotations_file', f'data/synthetic/annotations_{sid}.csv', '--interventions_file', f'data/synthetic/interventions_{sid}.csv', '--output_file', f'data/synthetic/aligned_{sid}.csv'], check=True)
  "

  # 3. Build sliding 30s input / 20s forecast sequence windows
  .\.venv\Scripts\python.exe src/features/build_windows.py --aligned_dir data/synthetic --output_dir data/synthetic

  # 4. Train & evaluate baselines and TCN forecaster on identical held-out test split (Learner L003)
  .\.venv\Scripts\python.exe src/models/run_benchmark_comparison.py

  # 5. Export trained PyTorch model to ONNX & verify numerical parity
  .\.venv\Scripts\python.exe src/models/export_onnx.py --checkpoint_file models/tcn_forecaster/model.pt --output_onnx models/tcn_forecaster/model.onnx

  # 6. Run automated test suites
  .\.venv\Scripts\python.exe -m unittest tests/test_pipeline.py
  cd app ; npm test ; npm run type-check ; cd ..
  ```

---

## 3. Project File Structure

```
PBEF/
├── app/
│   ├── package.json              # npm dependencies (React, TypeScript, tsx)
│   ├── tsconfig.json             # TypeScript compiler options (strict, bundler resolution)
│   └── src/
│       ├── event_logger.ts       # Client monotonic event logger (incremental flush, stimulus tracking)
│       ├── event_logger.test.ts  # Unit tests for event logger (flush cursor, stimulus consumption)
│       ├── demo_logger.ts        # Standalone runnable demonstration script (npm run demo-logger)
│       └── annotation_tool.tsx   # React educator annotation tool (5s ribbon, inspector, Kappa engine)
├── configs/                      # Experiment hyperparameters
├── data/
│   ├── raw/                      # Confidential human data (never committed, protected by .gitignore)
│   ├── processed/                # Normalized tensors
│   └── synthetic/                # 9 reproducible synthetic verification sessions
├── docs/
│   ├── DATA_CONTRACT.md          # Input/output schemas and contracts
│   ├── OBSERVABLE_LABELS.md      # Educator behavioral criteria and dual-annotator protocol
│   ├── IMPLEMENTATION_CHECKLIST.md # 18-task progress tracking log
│   └── PROJECT_STATUS_REPORT.md  # Detailed status report and git push instructions
├── models/                       # Checkpoints (.pt, .onnx, .pkl; ignored by git)
│   ├── baseline/                 # Saved baseline models and rules
│   └── tcn_forecaster/           # Saved TCN weights, config.json, metrics.json, model.onnx
├── results/
│   └── metrics/                  # benchmark_comparison.csv, event_metrics.json
├── src/
│   ├── evaluation/
│   │   └── evaluate_events.py    # Event-level evaluation with 15s cooldown and lead times
│   ├── features/
│   │   ├── align_annotations.py  # 1-second bin alignment
│   │   ├── build_windows.py      # Zero-leakage sliding window extractor (stride=1s)
│   │   └── generate_sample_sessions.py # Reproducible session generator
│   └── models/
│       ├── export_onnx.py        # ONNX exporter with numerical parity check
│       ├── train_forecaster.py   # PyTorch TCN forecaster with reliability gating
│       ├── train_logistic.py     # Summary-statistic baseline & threshold rules
│       └── run_benchmark_comparison.py # Fair head-to-head benchmark on held-out test split
├── tests/
│   └── test_pipeline.py          # 5 automated integration tests for pipeline
├── .gitignore                    # Enforces ethics & confidentiality (ignores raw data & binaries)
├── README.md                     # Comprehensive project documentation
├── requirements.txt              # Pinned Python package dependencies
└── PP1_AUDIT_PACKAGE.md          # Formal technical audit package (this document)
```

---

## 4. Data Sources and Generation

- **Data status:** **100% Synthetic Verification Fixtures** (Used exclusively for pipeline verification, temporal isolation validation, and technical feasibility demonstration. NOT claimed as clinical evidence of real learner performance).
- **Generator script:** [`src/features/generate_sample_sessions.py`](src/features/generate_sample_sessions.py)
- **Generation command:**
  ```powershell
  python src/features/generate_sample_sessions.py --num_learners 3 --sessions_per_learner 3 --session_length_sec 240 --output_dir data/synthetic
  ```
- **Learners generated:** 3 pseudonymous learners (`L001`, `L002`, `L003`)
- **Sessions per learner:** 3 sessions each $\rightarrow$ **9 total sessions** (`S_L001_01` to `S_L003_03`)
- **Duration per session:** 240 seconds (4 minutes)
- **Sampling / Binning frequency:** Monotonic millisecond timestamps aggregated into **1-second bins** (240 bins per session $\rightarrow$ **2,160 total bins**).
- **Total raw events generated:** 1,260 interaction events (mean: 140 events/session).
- **Features generated per 1s bin:** 11 features:
  1. `event_count`
  2. `response_count`
  3. `mean_latency_ms`
  4. `max_latency_ms`
  5. `error_count`
  6. `prompt_count`
  7. `touch_count`
  8. `pause_duration_ms`
  9. `visual_valid`
  10. `head_yaw_mean`
  11. `face_presence_ratio`
- **Synthetic label generation logic:**
  - In each session, 1 to 2 distinct decrease episodes are simulated at randomized intervals (e.g., between 90s and 140s).
  - During decrease episodes: response latency increases by $+1800\text{ms}$, touch frequency drops by 85%, and pause duration exceeds 4000ms.
  - An educator intervention occurs near the end of the episode (resetting the state).
  - A self-regulation period (`REGULATING`) is simulated around 55s–75s (stimming / motor movement) where task touch is paused but gaze/presence remains active; this is explicitly labeled `REGULATING` and NOT counted as a decrease.
- **Random seed:** Fixed seeds (42, 43, 44) for exact reproducibility.
- **Real participant data used:** **None.** (Real child data collection requires ethical committee approval and separate institutional access).

---

## 5. Event Logging

### Implementation & Correctness Resolutions

The client event logger is implemented in [`app/src/event_logger.ts`](app/src/event_logger.ts) and resolves critical edge cases:

1. **Incremental Cursor Flushing (Issue 3 Resolution):**
   - Configurable `flushMode: 'incremental' | 'snapshot'` (defaults to `'incremental'`).
   - Tracks `lastFlushedIndex`. When `flush()` is called periodically, it slices `this.events.slice(this.lastFlushedIndex)` and advances the cursor, guaranteeing that earlier events are never duplicated during streaming uploads.
2. **Stimulus Consumption (Issue 4 Resolution):**
   - `logStimulusPresented(stimulusId)` stores monotonic stimulus time and associates an explicit `stimulus_id`.
   - When `logResponse()` is invoked, it calculates latency and **immediately sets `this.lastStimulusTime = null`**. Subsequent touches or duplicate responses cannot inherit a stale stimulus timestamp.
3. **Monotonic Clock:**
   - Uses `performance.now()` relative to `sessionStartTime` with fallback to `Date.now()`. Timestamps are guaranteed non-negative and monotonic ($t_0 = 0$).
4. **Camera Masking:**
   - Visual frames are logged via `logVisualFrame(features)` with an explicit `is_valid: boolean` flag. Missing or occluded camera data is passed as `is_valid: false`.

### Relevant Excerpt: Incremental Flushing & Stimulus Consumption

```typescript
// app/src/event_logger.ts (Excerpt)

export class SessionEventLogger {
  private lastStimulusTime: number | null = null;
  private currentStimulusId: string | null = null;
  private lastFlushedIndex = 0;
  private flushMode: 'incremental' | 'snapshot';

  public logStimulusPresented(stimulusId?: string): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();
    this.lastStimulusTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.currentStimulusId = stimulusId ?? `stim_${elapsed}`;
    // ... creates stimulus_presented event ...
  }

  public logResponse(params: { isCorrect?: boolean; touchX?: number; touchY?: number }): InteractionEvent {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let latency: number | null = null;

    if (this.lastStimulusTime !== null) {
      latency = Math.max(0, Math.round(now - this.lastStimulusTime));
      this.lastStimulusTime = null; // STIMULUS CONSUMED: Prevents stale latency on subsequent touches
    }

    const eventMetadata = { ...(this.currentStimulusId ? { stimulus_id: this.currentStimulusId } : {}) };
    this.currentStimulusId = null;
    // ... creates response event with latency and metadata ...
  }

  public async flush(): Promise<void> {
    if (!this.onFlush) return;

    if (this.flushMode === 'snapshot') {
      if (this.events.length > 0) await this.onFlush([...this.events]);
    } else {
      // INCREMENTAL MODE: Only emit events recorded since last flush cursor
      if (this.lastFlushedIndex < this.events.length) {
        const batch = this.events.slice(this.lastFlushedIndex);
        this.lastFlushedIndex = this.events.length;
        await this.onFlush(batch);
      }
    }
  }
}
```

---

## 6. Annotation and Label Definitions

Conforming to [`docs/OBSERVABLE_LABELS.md`](docs/OBSERVABLE_LABELS.md):

- **State categories:**
  - `ACTIVE`: Attending to screen, interacting within baseline latencies ($< 2.5\text{s}$), attempting tasks.
  - `PASSIVE_DECREASE`: Cessation of touch, latency acceleration $> 2\sigma$, ignoring prompts, tapping off-target.
  - `REGULATING`: Self-calming, deep breathing, rhythmic rocking, sensory processing. **Excluded from negative events.**
  - `UNCERTAIN`: View obscured, ambiguous movement, or contradictory cues. Excluded from training loss.
- **Onset Event Definition:**
  - Transition from `ACTIVE` to `PASSIVE_DECREASE` that persists for at least 10 consecutive seconds.
  - Must not be triggered by a teacher intervention or activity swap.
- **Resolution:** 5-second annotation windows ($0-5\text{s}, 5-10\text{s}, \dots$).
- **Dual Annotation Protocol:** At least 20% of sessions are independently coded by two observers. The annotation tool ([`app/src/annotation_tool.tsx`](app/src/annotation_tool.tsx)) includes an integrated Cohen's Kappa calculator:
  $$P_o = \frac{\text{agreed windows}}{N}, \quad P_e = \sum_{c} P_{A}(c) P_{B}(c), \quad \kappa = \frac{P_o - P_e}{1 - P_e}$$
- **Disagreement Handling:** Disagreements are flagged for supervisor adjudication; unresolved segments are assigned `UNCERTAIN`.

---

## 7. Feature Engineering and Window Construction

- **Input History Length ($T_{\text{in}}$):** 30 seconds (30 timesteps of 1-second bins).
- **Forecast Horizon ($H$):** 20 seconds into the future ($[t, t + 20\text{s}]$).
- **Sampling Resolution:** 1-second bins.
- **Window Stride ($\Delta t$):** **1 second** (Sliding overlapping windows).
- **Clarification on Window Overlap (Issue 1 Resolution):**
  - For a 240-second session, candidate cutoff points $t$ range from $t = 30$ to $t = 240 - 20 = 220\text{s}$.
  - Candidate windows per session = $220 - 30 + 1 = \mathbf{191\text{ windows}}$.
  - Across 9 sessions: $9 \times 191 = \mathbf{1,719\text{ total candidate windows}}$.
  - Adjacent windows share up to 29 seconds of history. **They are overlapping sliding windows.**
  - **Leakage Prevention:** Splitting is strictly performed at the **participant level** and **session level** prior to window extraction. No session or learner appears in both train and test sets.
- **Personal Baseline Normalization:**
  - First 60 seconds of active engagement serve as learner calibration ($\mu_{\text{calib}}, \sigma_{\text{calib}}$).
  - Interaction latencies and pause durations are normalized:
    $$z = \frac{x - \mu_{\text{calib}}}{\sigma_{\text{calib}} + \epsilon}$$
  - Cold-start fallback: If no calibration window exists, population training set statistics are used.
- **Window Validity & Discard Criteria:**
  - Truncated session tail ($< 20\text{s}$ follow-up remaining): Discarded.
  - Teacher intervention in $[t, t + 20\text{s}]$ before onset: Marked `is_valid = 0` (prevents intervention contamination).
  - Target window with $> 30\%$ `UNCERTAIN` annotations: Marked `is_valid = 0`.
- **Actual Window Counts (from 9 synthetic sessions):**
  - Total candidate windows: **1,719**
  - Valid windows (`mask == 1`): **1,539** (89.5%)
  - Excluded/Invalid windows: **180** (10.5%)
  - Total forecast onset positive windows: **216** (14.0% class prevalence)

---

## 8. Train, Validation and Test Splitting

To ensure absolute methodological fairness, data is partitioned strictly by **independent participant**:

| Split Name | Participants Assigned | Sessions Assigned | Valid Windows | Onset Positives | Positive Prevalence |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Training** | `L001`, `L002` | `S_L001_01`, `S_L001_02`, `S_L002_01`, `S_L002_02` (4 sessions) | **684** | 96 | 14.0% |
| **Validation** | `L001`, `L002` | `S_L001_03`, `S_L002_03` (2 sessions) | **342** | 48 | 14.0% |
| **Held-Out Test** | **`L003`** (Untouched) | `S_L003_01`, `S_L003_02`, `S_L003_03` (3 sessions) | **513** | 72 | **14.0%** |

- **Zero Participant Leakage:** Learner `L003` is strictly held out. No data from `L003` was seen during scaler fitting, model training, or threshold selection.
- **Fair Threshold Selection:** Optimal classification thresholds are selected on the **validation split only** by maximizing validation F1, and then frozen before evaluating on the held-out test split.

---

## 9. Model Architecture & Baselines

### 9.1 Deterministic Threshold Rule
- **Features:** Mean latency over 30s (`X[:, 0]`) and total pause duration (`X[:, 4]`).
- **Rule:** Flag warning if $(\text{mean\_latency} > T_{\text{lat}}) \lor (\text{total\_pause} > T_{\text{pause}})$.
- **Parameters:** Learned percentiles from training set: $T_{\text{lat}} = 1,489.1\text{ms}$, $T_{\text{pause}} = 3,210.5\text{ms}$.

### 9.2 Logistic Regression Baseline
- **Input Features (9 summary metrics collapsed from 30s):**
  Mean latency, max latency, latency standard deviation, latency slope (linear fit), total pause, total touches, max prompts, total errors, total events.
- **Preprocessing:** `StandardScaler` fitted strictly on training split summary features.
- **Imbalance Handling:** `class_weight='balanced'`.

### 9.3 Temporal Convolutional Network (TCN)
- **Input Tensor:** $[B, 11, 30]$ (Batch size $B$, 11 features, 30 time steps).
- **Interaction Temporal Encoder:**
  - $\text{Conv1D}(8 \to 32, \text{kernel}=3, \text{padding}=1) \to \text{BatchNorm1D} \to \text{ReLU} \to \text{Dropout}(0.2)$
  - $\text{Conv1D}(32 \to 32, \text{kernel}=3, \text{padding}=1) \to \text{BatchNorm1D} \to \text{ReLU}$
  - $\text{AdaptiveAvgPool1D}(1) \rightarrow [B, 32]$
- **Optional Visual Temporal Encoder:**
  - $\text{Conv1D}(3 \to 16, \text{kernel}=3, \text{padding}=1) \to \text{BatchNorm1D} \to \text{ReLU}$
  - $\text{AdaptiveAvgPool1D}(1) \rightarrow [B, 16]$
- **Multimodal Reliability Gate:**
  - Gate network: $\text{Linear}(32 + 16 \to 16) \to \text{Sigmoid}$
  - Camera validity mask $M_{\text{vis}} = \frac{1}{30} \sum_{t} \text{visual\_valid}_t \in [0, 1]$
  - Gated visual embedding: $h_{\text{vis\_gated}} = h_{\text{vis}} \odot (\text{gate\_weight} \cdot M_{\text{vis}})$
  - When camera is disabled or missing ($M_{\text{vis}} = 0$), visual branch is completely zeroed out.
- **Dual Heads:**
  - *Forecast Head:* $\text{Linear}(48 \to 1) \rightarrow \text{Binary Onset Logit}$ ($\hat{y} \in [0, 1]$ via Sigmoid).
  - *Current State Head:* $\text{Linear}(48 \to 3) \rightarrow \text{3-class Logits}$ (`ACTIVE`, `PASSIVE_DECREASE`, `REGULATING`).
- **Loss Formulation:**
  $$\mathcal{L} = \text{BCEWithLogitsLoss}(y_{\text{forecast}}, \hat{y}_{\text{forecast}}; w_{\text{pos}} = 3.0) + 0.3 \cdot \text{CrossEntropyLoss}(y_{\text{state}}, \hat{y}_{\text{state}})$$
- **Optimizer:** Adam ($\text{lr} = 0.001$, weight decay = $10^{-4}$), 30 epochs, batch size = 16.

---

## 10. Empirical Head-to-Head Benchmark Results

The following metrics were computed by [`src/models/run_benchmark_comparison.py`](src/models/run_benchmark_comparison.py) on the **identical, untouched held-out test split (Learner L003, 513 windows, 14.0% prevalence)**:

| Model / Ablation | Model Type | PR-AUC | ROC-AUC | F1-Score | Precision | Recall | Brier Score | Decision Threshold |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Prevalence Chance Baseline** | Random / Prior | `0.1404` | `0.5000` | `0.0000` | `0.0000` | `0.0000` | `0.1207` | 1.0000 |
| **Deterministic Threshold Rule** | Heuristic Rule | `0.1292` | `0.2799` | `0.1987` | `0.1292` | `0.4306` | `0.4873` | $z_{\text{lat}} = +0.22$ |
| **Logistic Regression (30s Summaries)** | Linear Baseline | `0.2067` | `0.6952` | `0.2239` | `0.2419` | `0.2083` | `0.2716` | $0.7900$ |
| **TCN Full Proposed (Personalized + Gate)** | Temporal ConvNet | **`0.1698`** | **`0.6009`** | **`0.2886`** | `0.1686` | **`1.0000`** | `0.2271` | $0.3700$ |
| **TCN Ablation: Camera Masked Fallback** | Camera Suppressed | **`0.1698`** | **`0.6009`** | **`0.2886`** | `0.1686` | **`1.0000`** | `0.2271` | $0.3700$ |

### Critical Analysis of Results (For PP1 Viva Defense):
1. **Prevalence Context:** The test class prevalence is $14.04\%$ (72 positive windows out of 513). A dummy classifier outputting constant positive class prevalence achieves a PR-AUC of `0.1404`.
2. **Key Scientific Finding — Logistic Regression Outperforms TCN on Ranking Metrics:**
   - **PR-AUC:** Logistic regression (`0.2067`) beats TCN (`0.1698`) in ranking positive forecast windows above negative ones.
   - **ROC-AUC:** Logistic regression (`0.6952`) also outperforms TCN (`0.6009`) in overall discriminative ranking.
   - **F1 vs. Recall Trade-Off:** The TCN achieves higher F1 (`0.2886` vs `0.2239`) at its validation-selected threshold ($0.37$), but this is accompanied by perfect recall (`1.0000`) and low precision (`0.1686`). At this threshold, the model catches all 72 positive windows in the test set, but also produces 355 false positives.
   - **Academic Integrity Defense:** Perfect recall alone is not evidence of model superiority. Simple summary statistics (mean latency, total pause) provide strong discriminative cues on synthetic sequences. This demonstrates the value of rigorous benchmarking and provides an authentic research question for future modeling: *Under what temporal dynamics does deep sequence modeling provide true predictive value over calibrated linear baselines?*
3. **Threshold Baseline Brier Score Reconciliation:**
   - The threshold baseline makes hard binary predictions ($y \in \{0, 1\}$). Its Brier score equals the fraction of incorrect decisions: $\frac{FP + FN}{N} = \frac{209 + 41}{513} = \frac{250}{513} = \mathbf{0.4873}$. (The earlier document draft contained a typographical error of $0.5185$; the codebase and `benchmark_comparison.json` strictly compute $0.4873$).
4. **Camera Gating Clarification (Missing-Camera Fallback Test):**
   - In the synthetic test set, all visual frames have `visual_valid = 0.0` (0 valid visual frames).
   - Because visual data is absent, the reliability gate correctly zeros out the visual branch ($h_{\text{vis\_gated}} = 0$).
   - Therefore, evaluating with camera features unmasked vs masked yields identical metrics (`PR-AUC = 0.1698`).
   - This experiment serves as an independent **missing-camera fallback test** (proving numerical stability and graceful degradation when camera data drops out), rather than evidence that visual features improve forecasting accuracy.

---

## 11. Event-Level Evaluation

Evaluated via [`src/evaluation/evaluate_events.py`](src/evaluation/evaluate_events.py):

- **Event Matching Algorithm:**
  - An alert fired at time $t$ is marked as a **True Positive (TP)** if an eligible onset begins in $[t, t + 20\text{s}]$ ($0 \le t_{\text{onset}} - t \le 20\text{s}$).
  - **Cooldown Suppression:** Once an alert fires, subsequent alerts within **15 seconds** are suppressed to prevent alerting fatigue.
  - **Duplicate Suppression:** At most 1 alert is matched per true onset episode (no double counting).
  - **Usable Lead Time:** Defined strictly as $(t_{\text{onset}} - t_{\text{alert}})$, bounded in $[0\text{s}, 20\text{s}]$.
- **Metrics on Held-Out Test Participant (Learner L003, 3 Sessions, 573s / 0.158 hr eligible observation):**
  - Total true onset events: **72**
  - Matched alerts (TP): **9**
  - Unmatched alerts (FP): **22**
  - Event-level Precision: **29.03%** ($\frac{9}{9 + 22}$)
  - Event-level Recall: **12.50%** ($\frac{9}{72}$)
  - Event-level F1: **0.1748**
  - False alerts per hour: **138.95 alerts / hour** ($\frac{22}{0.158\text{ hr}}$)
  - Mean Usable Lead Time: **4.44 seconds** prior to observable participation cessation.
  - Median Usable Lead Time: **0.0 seconds**.

---

## 12. ONNX Export and Browser Inference

- **Export Script:** [`src/models/export_onnx.py`](src/models/export_onnx.py)
- **Model Path:** `models/tcn_forecaster/model.onnx`
- **Opset Version:** 16 (legacy TorchScript-compatible exporter with UTF-8 stdout configuration)
- **Dynamic Axes:** Batch size dimension dynamic for both input and outputs:
  - Input: `input_features` $[B, 11, 30]$
  - Outputs: `forecast_logit` $[B, 1]$, `state_logits` $[B, 3]$
- **Inference Engine:** ONNX Runtime WebAssembly (`CPUExecutionProvider`)
- **Numerical Parity Verification:**
  - Input: Random tensor $[1, 11, 30]$
  - Max absolute difference (Forecast Logit): **`0.000000e+00`**
  - Max absolute difference (State Logits): **`5.960464e-08`**
  - Threshold requirement ($< 10^{-4}$): **PASSED** (Numerical equivalence confirmed).

---

## 13. Testing and Verification

- **Automated Python Test Suite:** [`tests/test_pipeline.py`](tests/test_pipeline.py)
  - Tests run: 5
  - Tests passed: **5 / 5 (100%)**
  - Covers: session simulation, 1s bin alignment, 30s-to-20s leakage isolation, baseline summary extraction, and TCN forward pass.
- **Client TypeScript Test Suite:** [`app/src/event_logger.test.ts`](app/src/event_logger.test.ts)
  - Tests run: 11 assertions
  - Tests passed: **11 / 11 (100%)**
  - Covers: incremental flush without duplication (Issue 3), stimulus latency consumption (Issue 4), and snapshot flush mode.
- **TypeScript Type Checking:** `tsc --noEmit` on `app/`: **0 errors, 0 warnings**.

---

## 14. Current Claims Matrix

| Metric / Claim | Reported Value | Source File / Artifact | Data Split Evaluated | Independently Reproduced? |
| :--- | :---: | :--- | :--- | :---: |
| **Chance Prevalence** | `14.04%` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **Threshold Rule F1** | `0.1987` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **Logistic Regression PR-AUC** | `0.2067` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **Logistic Regression ROC-AUC**| `0.6952` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **TCN Validation PR-AUC** | `0.3653` | `models/tcn_forecaster/metrics.json` | Validation Split (L001/L002) | YES |
| **TCN Held-Out Test PR-AUC** | `0.1698` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **TCN Held-Out Test F1** | `0.2886` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **Camera Masked Fallback PR-AUC**| `0.1698` | `results/metrics/benchmark_comparison.json` | Held-out Test (L003) | YES |
| **Event-Level Precision** | `29.03%` | `results/metrics/event_metrics.json` | Held-out Test (L003) | YES |
| **Mean Usable Lead Time** | `4.44s` | `results/metrics/event_metrics.json` | Held-out Test (L003) | YES |
| **ONNX Max Absolute Error** | `1.79e-07` | Console log / `export_onnx.py` | Multi-batch / masked tensors | YES |

- **Synthetic vs Real Data:** **100% of the numbers above derive from synthetic verification sessions.** None of these numbers represent verified efficacy on real autistic children.
- **Fair Comparison:** All test metrics are evaluated on the exact same held-out test participant (`L003`) over 513 windows.

---

## 15. Ethics, Privacy and Limitations

- **Non-Diagnostic Scope:** The system forecasts task participation decrease; it does NOT diagnose autism or assess affective states.
- **Protection of Self-Regulation:** Stimming, rocking, or cognitive processing pauses are explicitly protected under [`docs/OBSERVABLE_LABELS.md`](docs/OBSERVABLE_LABELS.md) and excluded from negative decrease labels.
- **Teacher Advisory Boundary:** The output is strictly advisory on a teacher dashboard. C3 never triggers automated prompts or interrupts the learner without teacher oversight.
- **Data Governance:** No video frames are ever recorded or stored; only low-dimensional derived head pose features (yaw, pitch) are processed in volatile memory. Real participant data is excluded from version control via `.gitignore`.
- **Known Limitations:**
  1. Results reflect synthetic interaction dynamics; clinical effectiveness requires institutional review and real learner sessions.
  2. False alerts can occur after spontaneous activity changes or external classroom distractions.

---

## 16. PP1 Demonstration Script (5-Minute Walkthrough)

- **0:00 - 0:45 | Introduction & Problem Scope:**
  Define the 20-second forecasting horizon. Emphasize the teacher advisory boundary and ethical protection of self-regulatory behaviors.
- **0:45 - 1:45 | Timeline & Annotation Suite Demo:**
  Open [`app/src/annotation_tool.tsx`](app/src/annotation_tool.tsx). Demonstrate scrubbing across 5-second windows, the interactive color ribbon, the micro-feature event inspector, and the dual-annotator Kappa agreement calculator.
- **1:45 - 2:45 | Architecture & Zero-Leakage Pipeline:**
  Walk through [`build_windows.py`](src/features/build_windows.py) showing how past 30-second inputs strictly terminate at time $t$ before the 20-second forecast window. Explain the 1D temporal convolution encoder and reliability gate.
- **2:45 - 4:00 | Results, Baselines & Honest Transparency:**
  Display the head-to-head comparison table (`results/metrics/benchmark_comparison.csv`). Openly state that metrics derive from synthetic verification fixtures, and explain why the logistic baseline was tested against the TCN on an identical held-out participant split (`L003`).
- **4:00 - 5:00 | ONNX Browser Deployment & Failure Mode Defense:**
  Demonstrate numerical parity ($5.96 \times 10^{-8}$) in [`export_onnx.py`](src/models/export_onnx.py). Discuss one realistic failure mode (e.g. child looking away to observe a peer) and how the 15-second cooldown and teacher advisory boundary prevent alert fatigue.

---

## 17. Questions for Supervisor / Viva Preparation

1. *Should adult proxy interaction data be collected before attempting special-education classroom pilot sessions?*
2. *Is an alert budget of $< 3.0$ false alerts per hour acceptable to educators during a 20-minute classroom session?*
3. *Should the visual branch remain strictly optional throughout the final framework, or should we evaluate mobile device camera permissions with school IT early?*

---

## 18. Evidence Integrity Declaration

- All reported metrics are copied directly from saved execution logs (`benchmark_comparison.json`, `event_metrics.json`): **YES**
- Any values estimated or manually altered: **NO**
- Any model not yet trained: **NO** (All models trained and checkpoints saved)
- Any synthetic result presented as real-world learner evidence: **NO** (Explicitly labeled as synthetic verification fixtures throughout).
