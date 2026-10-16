# Component 3 (PBEF) Data Contract & Interface Specifications

**Document Version:** 1.0.0  
**Effective Date:** October 2026

---

## 1. Raw Event Log (`event_log.jsonl` or CSV)

Emitted in real-time by `event_logger.ts` on the client application during task execution.

```json
{
  "learner_id": "L001",
  "session_id": "S20261016_01",
  "time_ms": 14250,
  "event_type": "response",
  "activity_id": "matching_shapes_03",
  "response_latency_ms": 1850,
  "prompt_count": 1,
  "accuracy": 1,
  "touch_x": 0.425,
  "touch_y": 0.612,
  "pause_before_action_ms": 950,
  "visual_features": {
    "head_pose_yaw": -4.2,
    "head_pose_pitch": 1.1,
    "face_present": true,
    "is_valid": true
  }
}
```

### Field Definitions

| Field Name | Type | Unit / Format | Description |
| :--- | :--- | :--- | :--- |
| `learner_id` | string | Pseudonymous (`Lxxx`) | Unique identifier for the learner. Never use real names. |
| `session_id` | string | ISO Date + Index | Identifies an unbroken activity session. |
| `time_ms` | integer | Milliseconds | Monotonic time elapsed since session start ($t_0 = 0$). |
| `event_type` | enum | string | `session_start`, `activity_start`, `stimulus_presented`, `touch_down`, `touch_up`, `response`, `hint_requested`, `hint_delivered`, `idle_pause`, `session_end`. |
| `activity_id` | string | string | Unique activity identifier. |
| `response_latency_ms`| integer | Milliseconds | Delay between stimulus presentation and response completion. Null when non-applicable. |
| `prompt_count` | integer | Count | Number of hints or prompts delivered in current trial/activity. |
| `accuracy` | float/null | 0.0 or 1.0 | Correctness of task action if applicable. |
| `pause_before_action_ms`| integer | Milliseconds | Pre-action hesitation time. |
| `visual_features` | object | Optional | Camera-derived features (yaw, pitch, face_presence, mask). Can be omitted if camera is disabled. |

---

## 2. Educator Annotation Log (`annotations.csv`)

Recorded via `annotation_tool.tsx` or live observer interface.

```csv
session_id,start_time_ms,end_time_ms,state_label,is_onset,annotator_id,uncertainty,notes
S20261016_01,0,5000,ACTIVE,0,ANN_01,0,Engaged in matching
S20261016_01,5000,10000,ACTIVE,0,ANN_01,0,Normal response
S20261016_01,10000,15000,PASSIVE_DECREASE,1,ANN_01,0,Onset of decrease: stops touching
S20261016_01,15000,20000,PASSIVE_DECREASE,0,ANN_01,0,Continuous disengagement
```

---

## 3. Intervention Log (`interventions.csv`)

Records adult prompt, redirection, or spontaneous break that alters learner state.

```csv
session_id,time_ms,intervention_type,initiator,impact
S20261016_01,18200,verbal_redirection,teacher,breaks_current_state
```

---

## 4. Personal Baseline Calibration Contract

- First **90 seconds** of initial valid activity can serve as the **Calibration Period** for a given learner.
- Features are normalized relative to this baseline:
  $$z = \frac{x - \mu_{\text{baseline}}}{\sigma_{\text{baseline}} + \epsilon}$$
- Cold-start fallback: If no calibration period exists, use global population statistics from the training set.

---

## 5. Model Inference Output Contract (`InferenceResult`)

The output schema returned by the C3 forecaster to the application dashboard or integration layer:

```json
{
  "risk_score": 0.78,
  "confidence": 0.84,
  "current_state": "ACTIVE",
  "onset_forecast_20s": true,
  "valid_until_ms": 25000,
  "modality_validity": {
    "interaction": true,
    "personal_baseline": true,
    "visual": false
  },
  "model_version": "c3_tcn_v1.0.0",
  "timestamp_ms": 15000
}
```

> **Boundary Reminder:** C3 supplies predictions and alerts to the educator dashboard. It NEVER initiates an autonomous action, prompts the child directly, or overrides teacher discretion.
