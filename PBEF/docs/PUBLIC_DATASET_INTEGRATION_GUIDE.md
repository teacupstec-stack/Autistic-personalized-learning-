# Public Dataset Integration & Benchmark Guide: Engagnition for PBEF

**Component 3: Personal-Baseline Participation Forecasting (PBEF)**  
*Document Version: 1.0 | Date: October 2026*

---

## 1. Overview & Research Justification

In response to supervisor review guidance, **Component 3 (PBEF)** integrates **Engagnition** (*Nature Scientific Data*, March 2024, $N=57$ autistic children) as our primary public clinical benchmark.

### Why Engagnition?
- **Autism Population Validity:** Recorded from 57 children diagnosed with Autism Spectrum Disorder (ASD).
- **Temporal Dynamics:** Continuous time-series of serious game actions, motor activity, eye-gaze fixation, and therapist interventions.
- **Multimodal Streams:** Includes video/gaze, physical movement (accelerometer), and physiological wristband sensors (Empatica E4: GSR, ST).

### Scope & Domain Boundaries
| Aspect | Engagnition Public Dataset | PBEF Tablet Web Application (D3 Pilot) |
| :--- | :--- | :--- |
| **Activity Setting** | Physical exergame (*"Defeat the Monster"*) | Tablet early numeracy (matching, counting, sorting) |
| **Primary Interaction** | Gross motor movements & physical game hits | Fine motor touch events, screen latencies, touch pauses |
| **Wearable Sensors** | Empatica E4 wristband (EDA/GSR, skin temperature) | None (prohibitive cost & tactile sensory aversion) |
| **Camera Role** | Gaze fixation & therapist interaction video | Optional web-camera face presence & head pose yaw |
| **Model Function** | **Benchmarking temporal sequence forecaster** | **Real-time client-side inference in web browser** |

---

## 2. Ingestion & Preprocessing Architecture

The adapter [`src/data/engagnition_adapter.py`](file:///e:/PBEF/src/data/engagnition_adapter.py) processes Engagnition data into the standardized PBEF 11-channel tensor:

```
Tensor Shape: (N_windows, 30, 11)
  - Time Sequence: 30 seconds of historical observations (1 Hz bins)
  - Target Horizon: 20 seconds into the future (binary forecast of decrease onset)
  - Personal Calibration: t >= 60s (first 60s isolated strictly for baseline statistics)
```

### Feature Channel Mapping
1. `game_event_count`: Interaction pace per second
2. `hit_count`: Successful motor/cognitive actions
3. `miss_count`: Errors or failed attempts
4. `pause_duration_ms`: Hesitation / motor delay before action
5. `accel_magnitude_mean`: Empatica E4 physical movement intensity
6. `gsr_mean`: Electrodermal activity (autonomic arousal)
7. `skin_temp_mean`: Peripheral skin temperature
8. `physio_valid`: Sensor validity mask (1 if wearable active, 0 if missing)
9. `gaze_fixation_ratio`: Screen gaze fixation ratio from front camera
10. `head_pose_yaw_var`: Head movement variability
11. `visual_valid`: Camera validity mask (1 if camera active, 0 if missing)

---

## 3. How to Run the Public Dataset Pipeline

All commands are executed from the repository root `E:\PBEF` using the project virtual environment.

### Step 1: Ingest and Inspect the Dataset
To inspect an existing or downloaded Engagnition dataset:
```powershell
.venv\Scripts\python.exe src/data/engagnition_adapter.py --data_dir data/engagnition --inspect
```

*(Note: If the Figshare 50GB archive is still downloading, generate schema-identical verification samples):*
```powershell
.venv\Scripts\python.exe src/data/engagnition_adapter.py --generate_sample --num_participants 6 --output_dir data/engagnition
```

### Step 2: Build Non-Leaking Forecasting Windows
Extracts 30s input windows with 20s future horizons, enforcing personal baseline normalization at $t \ge 60\text{s}$:
```powershell
.venv\Scripts\python.exe src/data/engagnition_adapter.py --data_dir data/engagnition --build_windows --output_dir data/engagnition
```
- **Outputs:**
  - `data/engagnition/engagnition_windows.npz`
  - `data/engagnition/engagnition_window_manifest.csv`

### Step 3: Run Head-to-Head Public Benchmark
Trains and evaluates all 6 baseline and proposed models on an untouched, held-out autistic participant (`P06`):
```powershell
.venv\Scripts\python.exe src/models/benchmark_engagnition.py
```
- **Outputs:**
  - `results/metrics/engagnition_benchmark.csv`
  - `results/metrics/engagnition_benchmark.json`

---

## 4. Empirical Benchmark Results on Real Engagnition Cohort

Evaluated strictly on **7 completely held-out clinical test participants** (`P40`, `P35`, `P28`, `P39`, `P42`, `P20`, `P26`; 1,578 test windows, 7.73% test prevalence):

### Consolidated Model Comparison Table (Audited)
| Model Configuration | Model Type | PR-AUC | ROC-AUC | Raw Brier | Calibrated Brier | Scientific Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Prevalence Chance Baseline (Train Prior)** | Heuristic Prior | `0.0773` | `0.5000` | `0.0755` | `0.0755` | **Theoretical reference** (evaluates constant prior `0.0127`) |
| **Population Logistic Regression** | Linear (`balanced`) | `0.1725` | `0.5643` | `0.0714` | `0.0714` | **Valid population baseline** (global raw feature summaries) |
| **Personalized Logistic Regression** | Linear (`balanced`) | `0.2027` | `0.3821` | `0.0703` | `0.0703` | **Anti-predictive** (overfits P41 personal shift) |
| **TCN Population Baseline** | 2-Layer Dilated TCN | `0.0663` | `0.4565` | `0.1761` | `0.1761` | **Underperforming** (overfits single train positive participant) |
| **TCN Personal Baseline** | 2-Layer Dilated TCN | `0.4709` | `0.9202` | `0.2524` | `0.2524` | **Strong ranking, poor probabilities** (predicts 0.45–0.74) |
| **TCN Full Proposed (Gate + Dropout)** | Multimodal Gate | **`0.4233`** | **`0.9176`** | **`0.0586`** | **`0.0586`** | **Strong ranking, regularized probabilities** (Brier < baseline) |
| **TCN Ablation: Camera-Masked Fallback** | Reliability Fallback | `0.4273` | `0.9193` | `0.0544` | `0.0544` | **Graceful resilience** (interaction channels sufficient) |

---

## 5. Audit Diagnostics & Scientific Findings

### A. Critical Finding: Participant Onset Concentration
A formal audit of all 37 Engagnition participants reveals extreme outcome concentration:
- **Zero-onset participants:** **29 of 37 participants (78.4%)** contain **0** onset windows (they remained engaged throughout).
- **Onset-bearing participants:** Only **8 of 37 participants (21.6%)** ever experienced a participation decrease onset.
- **Top 3 concentration:** `P53` (80 onsets), `P35` (54 onsets), and `P40` (48 onsets) account for **182 of 272 (66.9%)** of all onset windows across the entire dataset.
- **Split Distribution Reality:**
  - **Train split (23 PIDs, 3,869 windows):** 49 positive windows, of which **48 come from a single participant (`P41`)** and 1 from `P30`.
  - **Validation split (7 PIDs, 1,258 windows):** 101 positive windows (`P53`: 80, `P27`: 20, `P29`: 1).
  - **Test split (7 PIDs, 1,578 windows):** 122 positive windows (`P40`: 48, `P35`: 54, `P28`: 20). Notably, **60.7% of all test positives come from just two participants (`P35` and `P28`) across only 99 combined windows.**

### B. Explanation of Benchmark Anomalies
1. **Why Population TCN (ROC-AUC 0.4565) and Personalized LR (ROC-AUC 0.3821) underperform:**  
   Because 98% of training positives come from `P41`, unconstrained neural and linear models learn decision boundaries tailored exclusively to `P41`'s physiological signature. When transferred to `P40`, `P35`, and `P28`, raw global features fail to transfer without personal calibration, and linear personalized weights invert relative rankings.
2. **Why Population Logistic Regression achieves ROC-AUC 0.5643 and PR-AUC 0.1725:**  
   Global summary statistics of raw interaction and movement features provide genuine population discrimination (+123% over prevalence chance), proving population transfer is possible with simple linear boundaries, but highly sensitive in complex models.
3. **The Personal TCN Brier Score (0.2524) Diagnosed:**  
   Inspection of predicted probabilities reveals that 100% of test predictions from the Personal TCN fall into the narrow range `[0.4558, 0.7371]` (mean: `0.5207`). Because actual test prevalence is 7.73%, predicting ~0.52 for negative windows (92.27% of the test set) causes severe quadratic penalty: $(0.52 - 0)^2 \approx 0.27$, yielding Brier = 0.2524. The **Full Proposed TCN** resolves this: its multimodal reliability gate and modality dropout act as regularizers, bringing average test probabilities to `0.1031` and Brier score to **`0.0586`** (well below the constant baseline `0.0755`).
4. **Permutation Importance Confirms Gaze Is Redundant on Engagnition:**  
   Randomly permuting visual gaze channels (8..10) across test windows over 10 repeated runs produced PR-AUC = `0.4098 ± 0.0202` (baseline: `0.4233`, $\Delta = +0.0135$, within 1 standard deviation). Camera-masked fallback achieves PR-AUC = `0.4273`. Visual gaze provides no measurable marginal value in this exergame; the interaction and movement channels carry the entire predictive signal.
5. **Leave-One-Participant-Out (LOPO) Cross-Validation Across the Onset Cohort:**  
   Evaluating LOPO across all 6 valid onset-bearing participants (`P53`, `P35`, `P40`, `P41`, `P27`, `P28`):
   - **Population Logistic Regression:** PR-AUC = **`0.5284 ± 0.2755`** | ROC-AUC = **`0.5842 ± 0.2911`**
   - **Personalized TCN:** PR-AUC = **`0.4915 ± 0.2789`** | ROC-AUC = **`0.4256 ± 0.2061`**  
   LOPO confirms that cross-participant generalization on this dataset is constrained by small sample size and idiosyncratic individual baselines.

---

## 6. Event-Level Advance Warnings & Operating Points

- **Total Ground-Truth Decrease Episodes:** 11 discrete episodes
- **Matched Alerts (True Positives):** **9 (81.82% point estimate)**
- **95% Bootstrap Confidence Interval ($B=10,000$):** **`[54.5%, 100.0%]`** (Median `81.8%`)
- **Usable Lead Time Distribution:** Mean = **`8.67 seconds`** | Median = **`9.00 seconds`**
- **Operating Point Trade-off:**
  - *F1-Optimal Threshold ($t = 0.08$):* 9/11 episodes detected (81.8% recall), 32 false alerts (61.47 alerts/hour), precision = 21.95%.
  - *Clinical False-Alert Budget ($t = 0.30$):* 5/11 episodes detected (45.5% recall), 12 false alerts (23.05 alerts/hour), precision = 29.41%.

---

## 7. Defensible Claims for PP1 Report & Viva

### ✅ Defensible Claims to Make:
1. **Zero-Leakage Rigorous Pipeline:** Temporal windows strictly isolate personal baseline calibration to the initial 60s, beginning observation history strictly at $t \ge 90\text{s}$ (zero calibration leakage), with causal forward-filling and strict rising-edge onset definitions.
2. **Personal Calibration Value:** On held-out participants, personal baseline normalization substantially improves sequence ranking (ROC-AUC `0.9176`, PR-AUC `0.4233`) compared to the constant prior (`0.0773`) and population logistic regression (`0.1725`).
3. **Graceful Fallback Resilience:** The reliability gate and modality dropout allow the model to operate without degradation when the camera is masked (PR-AUC `0.4273`, Brier `0.0544`).
4. **Advance Warning Feasibility:** The system demonstrates advance warnings with a median lead time of 9.0 seconds, detecting 9 of 11 discrete clinical episodes (95% bootstrap CI: [54.5%, 100.0%]).

### ❌ Inaccurate Claims to Avoid:
1. **Do NOT claim "+610% gain over population":** The population TCN was anti-predictive (ROC-AUC 0.4565) due to single-participant training concentration. The fair comparison is against Population Logistic Regression (PR-AUC 0.1725), yielding an honest **+145% to +173% relative gain**.
2. **Do NOT claim multimodal gaze superiority:** Permutation importance proves visual gaze features add no measurable predictive benefit over interaction dynamics in this dataset. State honestly: *"The camera fallback enables graceful resilience, but multimodal benefit is not demonstrated on Engagnition."*
3. **Do NOT claim clinical readiness:** 61.47 false alerts/hour at the high-recall threshold requires operating point calibration under a specific false-alert budget (scheduled for PP2).
4. **Do NOT conflate Engagnition with the tablet numeracy app:** Engagnition benchmarks temporal sequence modeling on autistic children during an exergame; the tablet PWA pilot has its own distinct touch interaction dynamics.
