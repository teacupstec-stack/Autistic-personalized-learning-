# Component 3 (PBEF) Observable Label Guide & Annotation Protocol

**Document Version:** 1.0.0  
**Effective Date:** October 2026  
**Target Audience:** Component Owner, Research Supervisor, Educator Annotators

---

## 1. Ethical & Pedagogical Scope

### 1.1 What the Prediction Means
The forecasting system estimates whether a **teacher-defined decrease in task participation** will begin within the upcoming 20 seconds based on recent interaction dynamics (latencies, touches, pauses, errors, prompts).

> **Critical Boundary:** The model detects **participation dynamics**, NOT internal emotional states. It does not deduce whether a learner is bored, distressed, fatigue-induced, or overwhelmed.
> 
> Looking away, self-regulatory movements (e.g., stimming, rhythmic rocking), or deliberate pauses for cognitive processing must **NEVER** be categorized as disengagement.

---

## 2. Observable Participation Criteria

### 2.1 State Labels (Evaluated per 5-second Annotation Window)

| Label Code | Category Name | Observable Behavioral Criteria | Exclusions & Nuances |
| :--- | :--- | :--- | :--- |
| `ACTIVE` | Active Participation | Directly attending to the screen or task materials; interacting within expected baseline latencies; attempting matching/touch actions; following prompts. | Gaze may briefly avert to check environment if action follows within baseline cadence. |
| `PASSIVE_DECREASE` | Participation Decrease | Cessation of task-oriented interaction beyond acceptable pause thresholds; ignoring active prompts; repeated non-target tapping/swiping; persistent orientation away from activity. | Do not label if pause immediately follows a teacher intervention or instruction. |
| `REGULATING` | Processing / Self-Regulation | Learner is stimming, deep breathing, pacing within sight, or deliberately looking away while remaining receptive to task resume. | **Must NOT** be classified as decrease. Exclude from negative event onset. |
| `UNCERTAIN` | Ambiguous / Insufficient Data | View obstructed, contradictory signals, or annotator cannot reliably determine state. | Window is excluded from training loss or weighted to 0. Avoid forcing false positives. |

---

## 3. Forecast Target & Onset Definition

### 3.1 Future-Event Forecasting Target (`y_forecast_20s`)
- **Horizon ($H$):** 20 seconds into the future ($[t, t + 20\text{s}]$).
- **Target Value:** `1` if an eligible **participation decrease onset** occurs within $[t, t + 20\text{s}]$, else `0`.
- **Onset Event Criteria:** An onset event is declared at timestamp $t_{onset}$ if:
  1. The learner transitions from `ACTIVE` (or baseline readiness) to `PASSIVE_DECREASE`.
  2. The decrease persists for at least 10 consecutive seconds (to filter momentary hesitations).
  3. No teacher-led intervention or activity change triggered the pause.

### 3.2 Target Invalidation & Exclusions
A future window is marked **Invalid / Masked** (and excluded from training/evaluation) if:
- Less than 20 seconds of session time remains after time $t$ (session ending truncation).
- An explicit teacher intervention (e.g., physical prompt, oral redirection, activity swap) occurs in $[t, t + 20\text{s}]$ before any natural onset.
- More than 30% of the 20-second target window contains `UNCERTAIN` annotations.

---

## 4. Dual-Annotator Agreement Protocol

1. **Dual Coverage:** At least 20% of all sessions must be independently annotated by two trained observers.
2. **Metrics Reported:**
   - Cohen's Kappa ($\kappa$) for 5-second categorical states.
   - Temporal Onset Agreement (onset detected within $\pm 3$ seconds).
3. **Disagreement Handling:**
   - Where annotators disagree between `ACTIVE` and `PASSIVE_DECREASE`, a third senior adjudicator reviews the timeline.
   - If consensus cannot be reached, the segment is flagged as `UNCERTAIN`.

---

## 5. Session Timeline Synchronization

All events (application interactions, video frames, educator markers) must reference the **monotonic session clock** (`session_start_epoch_ms` with millisecond offsets `time_ms`). Real-time clocks subject to NTP drift or timezone shifts must not be used for alignment.
