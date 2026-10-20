# PBEF Component 3 — Model Contract & Inference Specification

## 1. Overview
This document defines the formal input/output contract, preprocessing requirements, tensor shapes, and inference policy for **Component 3 (PBEF — Personalized Baseline Engagement Forecasting)** Mode B interaction-only forecaster.

- **Model Identifier**: `TemporalForecaster_InteractionOnly_ModeB`
- **PyTorch Checkpoint**: `models/interaction_forecaster/model.pt`
- **ONNX Export**: `models/interaction_forecaster/model.onnx`
- **Target Application**: Camera-free, sensor-free participation monitoring on interactive tablets.

---

## 2. Input Tensor Specification

| Attribute | Specification | Notes |
| :--- | :--- | :--- |
| **Input Name** | `input_features` | Declared in ONNX graph input schema |
| **Tensor Shape** | `[batch_size, 2, 30]` | `batch_size = 1` for real-time inference |
| **Data Type** | `float32` (IEEE 754 32-bit float) | Values scaled via personal baseline |
| **Temporal Horizon** | 30 seconds (`history_sec = 30`) | 1-second discrete causal bins `[t - 30, t)` |
| **Causal Ordering** | Chronological | Index 0 is `t - 30s`; Index 29 is `t - 1s` |

### Channel Definitions

| Channel Index | Channel Name | Semantics |
| :--- | :--- | :--- |
| **Channel 0** | `perf_counts` | Count of learner interaction events in that 1-second bin (stimulus responses, touches, hints). |
| **Channel 1** | `inactivity` | Continuous elapsed seconds since the most recent learner interaction. Increments by 1.0s every empty second, resets to 0.0s when an interaction occurs in that bin. |

---

## 3. Preprocessing & Personal Baseline Normalization

Each channel is normalized relative to the learner's individual **60-second personal baseline calibration** ($t \in [0, 60s)$):

$$\mu_c = \frac{1}{60} \sum_{i=0}^{59} x_c(i), \quad \sigma_c = \max\left(\sqrt{\frac{1}{60} \sum_{i=0}^{59} (x_c(i) - \mu_c)^2}, \, 10^{-3}\right)$$

$$x_{c, \text{norm}}(t) = \frac{x_c(t) - \mu_c}{\sigma_c}$$

### Missing Data & Warmup Policy
1. **Calibration Phase ($t < 60s$)**: No inference is performed. Status is `warming_up`, and `risk_probability` is explicitly `null`.
2. **Observation Accumulation ($60s \le t < 90s$)**: The system has completed 60s calibration but has not yet accumulated a full 30s causal history window disjoint from calibration. Status is `warming_up`, and `risk_probability` is `null`.
3. **Full Operational State ($t \ge 90s$)**: Inference runs once per second if all channels are valid.
4. **Pre-calibrated Profile (Demonstration Mode)**: When demonstrating with an authenticated stored baseline profile (e.g., Alex Grade 4 Math Profile: $\mu=[0.85, 0.45], \sigma=[0.35, 0.80]$), valid inference can begin once the 30s interaction history is populated.
5. **Missing Features**: If required inputs are unavailable or corrupted, the system returns `insufficient_data` with `risk_probability: null`. Fabricated fallback values (e.g., defaulting missing latency to personal baseline or outputting a hardcoded 0.02) are strictly prohibited.

---

## 4. Output Specification

| Output Name | Shape | Semantics | Interpretation |
| :--- | :--- | :--- | :--- |
| `forecast_logit` | `[batch_size, 1]` | Raw uncalibrated logit for decrease onset in $(t, t + 20s]$ | $\text{risk} = \frac{1}{1 + e^{-\text{logit}}}$ |
| `state_logits` | `[batch_size, 3]` | 3-class current participation state logits | `0`: Low / Disengaged, `1`: Medium, `2`: High |

---

## 5. Threshold Selection & Operating Point

- **Validation Optimal F1 Threshold**: $\tau = 0.05$ (PR-AUC = 0.4751, ROC-AUC = 0.9209, Recall = 1.0, Precision = 0.0773 on test prevalence 0.0773).
- **Teacher Advisory Operating Threshold**: $\tau_{\text{advisory}} = 0.30$.
- **Alert State Machine Policy**:
  - Requires **3 consecutive predictions** $\ge \tau_{\text{advisory}}$ to trigger an educator advisory (suppresses momentary thinking pauses and hesitation).
  - Enforces a **30-second cooldown** after review generation to prevent notification spam.
  - Reviews remain **pending** until acknowledged by an educator, completely decoupled from subsequent real-time forecast drops.

---

## 6. Verification & Parity

- **PyTorch vs ONNX Parity**: Maximum absolute difference on random test batches is $\le 1.19 \times 10^{-7}$, well within the $10^{-4}$ verification tolerance.
- **WASM Browser Execution**: Model is packaged as a standalone ONNX graph (`model.onnx`, 40.7 KB) executable via `onnxruntime-web` in standard browser environments.
