# C2 research decisions

## 2026-10-16 — scope and provenance

All data and examples in this project are SIMULATED. No real learner benefit is
claimed. IDs are synthetic pseudonyms, not anonymisation guarantees. Only scripts,
schemas, configuration, documentation and synthetic fixtures belong in Git.
Raw data, fitted models and identifying media must not be committed.

C2 selects up to four teacher-approved activity variants (two difficulties by two
formats). C4 selects cues within a step. A confirmed break bypasses C2; this
package does not implement or claim to implement the approved external break flow.

Continuous implementation replaces the phase-by-phase approval pauses, per the
conversation. The requirement to ask about unspecified research decisions and
additional dependencies remains. jsonschema and Ajv were explicitly approved.
TypeScript was already specified. Their transitive dependencies are locked.

## Research question

Does confidence-aware shared context (C1/C3 signals) improve a constrained
activity-selection policy, compared with the same constrained policy without it?

## Metrics (simulated)

Primary: constrained cumulative reward on held-out simulator profiles and seeds.
Report policy comparisons and uncertainty across independent profiles/seeds.
Secondary: constraint violations (target zero), regret, failure-sequence length,
and calibration. Regret oracle, calibration target, aggregation, uncertainty
method and break handling in sequence metrics are not yet frozen.
No empirical policy results exist at this stage.

## Reward — specified, not frozen

reward = clip(0.7 * task_success + 0.3 * independent_completion
              - hint_penalty - distress_penalty, lo, hi)

A requested break is NOT a failure penalty. Reward weights belong in
models/config.json. The main weights above are specified; hint/distress penalty
functions and clipping bounds await approval. Alternative weights are sensitivity
analysis only. A missing annotation must not silently become zero distress.

## 2026-10-16 — contract implementation v0.1 (provisional wire conventions)

One JSON Schema Draft 2020-12 document defines snapshots, decision outputs and
separate decision/outcome log-event variants. Both languages load that file.
Semantic rules outside JSON Schema enforce comparisons across fields and time.
Unknown fields are rejected to prevent accidental outcome leakage.

Canonical UTC timestamps have exactly three fractional digits. Calendar validity
is checked in both languages. Recent result timestamps must be strictly earlier
than decision time. Signals, hints and confirmed requests may be contemporaneous;
future signals are invalid. Reproducibility uses event time, never wall-clock time.

C3 may be absent, null, fresh or expired. Missing and expired C3 resolve to null
(unknown) via effective_c3/effectiveC3, while original log content is preserved.
Expiry at decision time is expired. Valid risk zero remains known, distinct from
unknown. Confidence zero is preserved, not silently converted into risk zero.
No minimum qualification confidence has been chosen. C1 is represented here by
confirmed help/break requests only; additional confidence-aware C1 fields need an
upstream contract before integration.

Decision confidence and action propensity are nullable. Neither is fabricated.
A Thompson-sampling propensity is not automatically 1 / number of eligible actions.
Definition/estimation of these quantities remains a research decision.

The schema can represent no eligible action using action_id=null and an empty
eligible list. This is a representation, not approval of an operational fallback.
No teacher-intervention or break-flow implementation is shipped yet.

Event types are linked by decision_id. Decisions forbid outcome/independence/
override/distress fields. Outcomes contain those later fields and no snapshot.
Pair validation checks learner/session/action/time/provenance linkage. An overridden
outcome with a changed action is rejected pending a separately approved override
protocol, so it cannot silently update the recommended action's posterior.
A production append-only log must additionally enforce unique event IDs and
exactly-once posterior updates; this is not yet implemented.

Synthetic learner/session prefixes reduce accidental use of identifying text;
they cannot prove a record contains no identifying data.

## Freeze register

No final-testing freeze has occurred. Reward, splits, seeds, hyperparameter search
space and evaluation code must each have a dated freeze entry, code revision and
content hashes before final testing. Never tune on the held-out test set.
The fixture seed 42 is provenance for handcrafted contract examples, not an
approved experimental split or generator seed selection.

## Outstanding decisions before research implementation

- Approve reward penalty definitions and clipping bounds.
- Define decision confidence and C1/C3 qualification requirements.
- Approve empty-eligibility fallback and teacher override handling.
- Approve simulator response-rule families, session lengths, seeds and splits.
- Approve Bayesian prior/noise choices, reward bounding and propensity estimation.
- Approve early-stopping/search settings, metric estimators and freeze protocol.
- ONNX export needs an additional Python ONNX package; permission is required.

No extra models are authorised. The intended model set remains logistic regression,
a 32→16 BCE response encoder, frozen encoder plus Bayesian linear action heads,
and masked Thompson sampling. Fixed sequencing, educator rules, mask, simulator
and reward remain deterministic code.
