# C2 Learning Personalisation (SCPA Contextual Bandit)

A modern, accessible, research-grounded web application and machine learning policy system for **Component 2: Constrained Activity Personalisation**.

This system uses a **Shared Context Personalised Activity (SCPA)** contextual bandit to recommend educational counting activities for autistic and neurodivergent learners. It combines a frozen neural context encoder, Bayesian linear action heads, teacher-governed action boundaries, a three-consecutive-failure safety tripwire, and immediate zero-penalty break bypass.

---

## 1. System Architecture

```
                                 ┌───────────────────────────────┐
                                 │   Teacher / Curriculum Bank   │
                                 │  Approved Actions: {4 Variants}│
                                 └──────────────┬────────────────┘
                                                │
                                    Teacher Allowed Subsets
                                    & Failure Sequence Limit
                                                │
                                                ▼
┌───────────────────────────────┐     ┌───────────────────────────┐
│     Learner Context Snapshot   │     │    SCPA Bandit Policy     │
│ • Current Skill Estimate      ├────►│ • Frozen Encoder (32->16) │
│ • Recent Results (Success/Ind)│     │ • Masked Thompson Sampling│
│ • Hint Frequency              │     │ • Bayesian Action Heads   │
│ • C3 Affective Frustration    │     └─────────────┬─────────────┘
│ • Consecutive Failure Streak  │                   │
└───────────────────────────────┘                   ▼
                │                          Selected Activity Variant
                │                           (e.g., Easy Visual)
                ▼                                   │
┌───────────────────────────────┐                   ▼
│   Safety Tripwire Escalation  │     ┌───────────────────────────┐
│ • Streak >= Limit (e.g. 3)    │     │ Student Learning Session  │
│ • Halts selection (action=null│◄────┤ • Large A / B / C Buttons │
│ • Mandatory human intervention│     │ • Visual item counting    │
└───────────────────────────────┘     │ • "I Need a Break" button │
                                      └───────────────────────────┘
```

### Core Algorithmic Components:
1. **Context-Only Neural Response Encoder (`ContextEncoderMLP`)**:
   - Ingests 9 normalized context features (skill, success rate, independence rate, hint frequency, C3 risk value, C3 confidence, C3 known, C3 missing, consecutive failures).
   - Architecture: Input (9) $\to$ FC(32) + ReLU $\to$ FC(16) + ReLU $\to$ Latent Context $\phi(s) \in \mathbb{R}^{16}$.
   - Frozen weights ensure predictable representations without catastrophic forgetting.
2. **Bayesian Linear Heads & Masked Thompson Sampling**:
   - 4 action heads: `easy_visual`, `easy_text`, `medium_visual`, `medium_text`.
   - Feature vector: $x = [1.0, \phi(s)] \in \mathbb{R}^{17}$.
   - Gaussian prior: $m_0 = \mathbf{0}, S_0 = 10 \cdot I, \sigma^2 = 1.0$.
   - Draws posterior weight samples $w_a \sim \mathcal{N}(m_a, S_a^{-1})$ using Cholesky decomposition.
   - Evaluates only teacher-allowed actions ($a \in A_{\text{allowed}} \subseteq A_{\text{approved}}$).
   - Recursive online Bayesian updating on executed action heads only.
3. **Multi-Objective Reward Formulation**:
   $$R = \text{clip}(0.70 \times \text{success} + 0.30 \times \text{independent} - \text{hint\_penalty} - \text{distress\_penalty}, -0.30, 1.00)$$
   - Independent success: $+1.00$
   - Hint-assisted success: $+0.70 - (0.05 \times \min(\text{hints}, 4))$
   - Failure: $-0.30$
   - Break request: $0.00$ (policy completely bypassed; no posterior update)

---

## 2. Supported User Experiences

The application supports three cohesive, integrated user experiences:

### A. Educator / Teacher Dashboard (`/teacher`)
- **Action Boundaries**: Configure session-allowed actions as a strict subset of certified approved actions. The UI validates that allowed $\subseteq$ approved and prevents unapproved submissions.
- **Safety Threshold**: Configure the consecutive-failure tripwire threshold (default: 3).
- **Explainability Card**: Clear algorithmic breakdown of why an activity was recommended (Thompson score, C3 risk weighting, recent performance features).
- **Session Controls**: Start, pause, resume, end session, and view real-time student outcomes.
- **Human Intervention Alerts**: High-visibility alert when the safety tripwire activates, paired with an authorized educator unlock checklist.

### B. Student / Learner Mode (`/learner`)
- **Cognitive-Load-Reduced Layout**: Uncluttered visual hierarchy designed specifically for neurodivergent learners.
- **Visual Counting Items**: Engaging rendering of apples, stars, colorful fish, party balloons, blue birds, and suns with interactive tap-to-count highlights.
- **Text Story Rhymes**: Rhythmic prompts featuring kittens, busy bees, shiny shoes, and friendly frogs.
- **Large Touch Targets**: Accessible [A], [B], and [C] answer buttons with keyboard hotkeys (`A`, `B`, `C` or `1`, `2`, `3`).
- **Supportive Feedback**: Warm, celebratory feedback on correct answers and kind, non-punitive encouragement on incorrect attempts.
- **Friendly Hint Action**: Step-by-step guidance without stressful timers.
- **Prominent "I Need a Break" Button**: One-click instant activation.

### C. Researcher / Engineer Dashboard (`/research`)
- **Policy Comparison Dashboard**: Empirical metrics across 6 policies evaluated on 20 held-out profiles with 95% confidence intervals:
  - `SCPA_Full` (Masked Thompson Sampling + Frozen Context Encoder + C3 Risk)
  - `SCPA_NoSharedSignals` (Ablation: zeroed C1 and C3)
  - `SCPA_NoConfidenceWeight` (Ablation: raw C3 risk without confidence scaling)
  - `Educator_Rules` (Heuristic pedagogical decision tree baseline)
  - `Fixed_Sequencing` (Deterministic curriculum cycle baseline)
  - `Linear_Bandit` (Thompson sampling on raw 9 context features baseline)
- **Trade-Off Metrics**: Cumulative reward, one-step regret, success rate, independence rate, failure runs, and constraint violations (0 across all).
- **Pretraining Provenance**: EdNet KT1 public dataset benchmark and split manifests.
- **Model Inspector**: Architecture, loss curves, and Expected Calibration Error (ECE).

---

## 3. Required Screens Overview

| Screen | Route | Purpose |
|---|---|---|
| **Screen 1: Application Overview** | `/` | C2 system introduction, live session status, key learner indicators, module launcher cards. |
| **Screen 2: Teacher Dashboard** | `/teacher` | Learner summary, curriculum action boundaries, tripwire configuration, recommendation explainability. |
| **Screen 3: Certified Activity Bank** | `/activities` | Search and filter 12 certified counting activities by difficulty (easy/medium) and format (visual/text). |
| **Screen 4: Live Learning Session** | `/learner` | Student counting experience, large answer options, interactive hints, gentle star progress. |
| **Screen 5: Break & Safety Screen** | `/break` | Low-stimulation calm break, breathing circle animation, and zero-penalty contract guarantees. |
| **Screen 6: Safety & Intervention Centre** | `/safety` | Tripwire status gauge, contract rationale, human-in-the-loop checklist, and unlock workflow. |
| **Screen 7: Research & Evaluation** | `/research` | Empirical policy comparisons, 95% CIs, regret, ablations, EdNet benchmark, and dataset splits. |
| **Screen 8: Event History & Audit Log** | `/events` | Chronological log of `DecisionEvent` and `OutcomeEvent` records, schema validation badges, and JSON exporter. |

---

## 4. Non-Negotiable Safety Contracts

The application strictly implements the formal C2 safety invariants:

1. **Teacher-Defined Action Constraints**:
   - $A_{\text{eligible}} \subseteq A_{\text{allowed}} \subseteq A_{\text{approved}}$
   - The UI and backend reject any selection outside the teacher-allowed set.
2. **Consecutive-Failure Safety Tripwire**:
   - When consecutive failures $\ge \text{threshold}$ (default: 3), automated activity selection ceases immediately.
   - The policy outputs `action_id = null`, `eligible_actions = []`, and `action_propensity = null`.
   - The system refuses to silently pick a fallback activity and mandates human-in-the-loop teacher intervention.
3. **Break Bypass Guarantee**:
   - A student break request bypasses the contextual bandit immediately.
   - Breaks are **never** recorded as failures ($\text{penalty} = 0.00$).
   - No bandit parameters or posteriors are modified.
   - The failure streak is not incremented.
   - Learner mastery is not degraded.
   - Background activity selection is completely halted while on break.
4. **C3 Signal Freshness Semantics**:
   - Signals are fresh if and only if $\text{expires\_at} > \text{decision\_time}$.
   - Stale or missing signals are explicitly categorized as **Unknown** (never assumed to be zero risk).
5. **Strict UTC ISO Timestamps**:
   - All wire timestamps adhere to canonical UTC ISO 8601 with exactly 3 fractional digits (`YYYY-MM-DDTHH:mm:ss.sssZ`).
   - Timestamps are strictly monotonic: $\text{decision\_time} < \text{outcome\_time} < \text{next decision\_time}$.

---

## 5. Getting Started & Setup

### Prerequisites
- Node.js $\ge 18$ (tested on v24.9.0)
- Python $\ge 3.10$ (tested on Python 3.14.3)

### Installation
```bash
# Install dependencies
npm install
```

### Running the Frontend
```bash
# Start Vite development server
npm run dev

# Open browser at:
# http://localhost:3000
```

### Production Build
```bash
# Run TypeScript type check and build Vite bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 6. Testing & Verification

The repository includes a comprehensive two-tier test suite verifying both TypeScript contracts and React frontend interactions:

```bash
# Run complete test suite (TypeScript contracts + Vitest)
npm test

# Run only the contract JSON Schema verification tests
npm run test:contracts

# Run only the Vitest UI and integration tests
npm run test:ui
```

### Python Pipeline Execution
To execute the complete backend machine learning pipeline:
```bash
# Run data generation, encoder training, policy evaluation, and model export
python3 run_all.py

# Run interactive terminal demo
python3 demo.py

# Run terminal student learning session
python3 app/interactive_session.py
```

---

## 7. Empirical Evaluation Results

Evaluated across 20 held-out profiles from unseen response families (`threshold_mastery`, `fatigue_recovery`) over 100 episodes per policy:

| Policy | Mean Cumulative Reward (95% CI) | 1-Step Regret | Success Rate | Independence | Max Failure Run | Constraint Violations |
|---|---|---|---|---|---|---|
| **SCPA Full (Proposed)** | **7.16 [5.78, 8.54]** | **0.1378** | **53.0%** | **36.8%** | **17** | **0** |
| SCPA (No Shared Signals) | 7.24 [5.86, 8.60] | 0.1328 | 53.6% | 36.3% | 17 | 0 |
| SCPA (No Conf. Weight) | 6.80 [5.43, 8.16] | 0.1410 | 51.8% | 36.4% | 17 | 0 |
| Educator Rules (Heuristic) | 7.33 [6.03, 8.66] | 0.1484 | 52.4% | 37.1% | 12 | 0 |
| Fixed Sequencing (Baseline) | 6.71 [5.39, 8.06] | 0.1567 | 51.6% | 35.6% | 14 | 0 |
| Linear Bandit (Baseline) | 6.31 [4.88, 7.72] | 0.1437 | 50.0% | 34.4% | 17 | 0 |

*Zero constraint violations were observed across all 600 evaluated policy episodes.*

---

## 8. License & Provenance

- **C2 Personalisation System**: Research component for autistic-personalized educational technology.
- **Pretrained Knowledge Tracing Data**: Benchmarked against EdNet KT1 (Riiid Labs, CC BY-NC 4.0).
