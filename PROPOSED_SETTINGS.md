# Proposed settings — approval required, not implemented or frozen

All following choices are proposed engineering/research assumptions for simulated
experiments. They are not evidence about learners and are not final-test results.
Approve or revise this document before implementing these choices.

1. Reward: bounds [-1, 1]; hint penalty = 0.05 × min(hint count, 4);
   distress penalty = 0.30 when the simulator supplies a positive annotation.
   Missing outcome/independence/hint/distress fields make reward unavailable;
   do not impute them or update a posterior. Breaks generate no C2 selection,
   no reward and no posterior update. Sensitivity success/independence weights:
   (0.5, 0.5) and (0.9, 0.1), with other penalties unchanged.
2. Fallback: when eligible actions are empty, return null action and request
   teacher intervention; never bypass eligibility. No autonomous fallback action.
   A changed-action teacher override logs the executed action explicitly, links to
   the original decision, requires that action be teacher-approved, and updates
   only its head. Rejected/invalid outcome links do not update anything.
3. Mock activities: four explicitly synthetic approval fixtures with two difficulty
   levels and two presentation formats. Label approval as simulated, never imply
   actual educator review. Eligibility intersects approved and allowed actions;
   when the maximum consecutive failure limit is reached, require teacher review.
   C3 never creates a new teacher constraint. Breaks bypass selection.
4. Shared inputs: use existing confirmed help/break requests as C1 inputs. Add an
   optional C1 confidence+observation+expiry envelope, preserving confirmed break
   bypass regardless of a learned policy. No unconfirmed request is acted upon.
   Fresh C3 confidence weights the risk feature by multiplication; preserve separate
   presence and confidence features. Unweighted ablation keeps the same network
   architecture and features but uses raw risk. No-shared ablation removes C1/C3
   predictive features while preserving break handling and identical teacher rules.
   Signal expiry alone determines availability; no unapproved confidence threshold.
5. Encoder: context-only MLP with hidden ReLU units 32 then 16; four action-output
   logits during training. Apply BCE only to the logged action's observed success.
   Compare logistic regression using context plus action indicators. Fit numeric
   normalisation on training contexts only; impute numeric missing values with
   training means plus explicit missingness indicators. Fit distinct encoders for
   the main ablations on the same training split. Freeze encoder before bandit use.
6. Bayesian heads: Gaussian linear reward approximation, one head per action,
   prior mean zero, prior precision 10 × identity, fixed observation variance 1.
   Include a bias feature. Clip predictions/sampled rewards to reward bounds;
   report that this is an approximation, not a bounded-likelihood posterior.
   Apply eligibility before sampling. Randomise exact ties using seeded RNG.
   Update only the observed action, exactly once per outcome event.
7. Confidence and propensity: decision confidence remains null until a calibrated
   definition is approved. Calibrate the success predictor, not the null decision
   confidence: Brier score and ten equal-width-bin ECE. For Thompson sampling,
   log action_propensity=null instead of claiming an exact action probability;
   no inverse-propensity evaluation. Deterministic baselines log propensity 1.
8. Simulator families: training families use additive skill/difficulty response and
   presentation preference rules; validation uses new profiles from those same
   families. Held-out test families use threshold/mastery and sequence-dependent
   fatigue/recovery rules. Outcomes come solely from explicit simulator equations
   and RNG, never a fitted model. Document actual equations before freezing.
   Use 40 training profiles, 10 validation profiles and 20 unseen-family test
   profiles, each with five 30-step sessions. Assign each profile and all sessions
   to one split before any preprocessing. Generator seeds: train 101–105,
   validation 201–205, test 301–305. Training seed 42. Policy seeds 401–410.
   Training data use uniform sampling over eligible synthetic actions.
9. Training search: Adam lr 0.001, batches 16 and 32, max 50 epochs, validation
   BCE early stopping with patience 5 and min_delta 0.0001. Choose best validation
   BCE; ties prefer batch 16 and earlier epoch. Deterministic CPU execution.
   Logistic regression uses C=1, max_iter=1000, random_state=42.
10. Evaluation: primary reward is summed over fixed session horizons and then
    averaged across independent profiles with policy-seed averages per profile.
    Report cumulative curves, totals and a profile-cluster bootstrap 95% interval
    using 1000 draws, seed 501. Use common exogenous simulator random draws across
    policies while preserving each policy's state trajectory. Regret is one-step
    expected reward regret versus the best currently eligible action under the
    same simulator state, not optimal long-horizon policy regret. Failures are
    consecutive unsuccessful attempts, reset at session boundaries and successful
    attempts; a break neither increments nor resets the counter. Report maximum
    and mean run lengths. Report every constraint violation, not only a rate.
11. Before final evaluation, hash and date-freeze reward config, split manifest,
    simulator equations, seed lists, search space and evaluation code in
    DECISIONS.md. Do not inspect held-out performance during development. Write
    actual metrics, code revision, seed lists and source=simulated to metrics.json.
    If the gate fails, fix without inspecting test outcomes and record a new freeze.
12. Additional dependency: Python onnx is needed for export (use the legacy
    torch.onnx.export path to avoid adding onnxscript). Use the already specified
    React/TypeScript/ONNX Runtime Web stack. Use TypeScript compiler and a native
    import map for the demo, avoiding an additional bundler dependency. Select
    compatible exact versions and lock all transitive dependencies. Browser parity
    must compare exported embeddings against Python fixtures before claiming
    successful browser inference. Any unavailable runtime test is reported as such.

These proposals do not expand the authorised model set. A full project depends on
approval of these outstanding choices, especially reward/priors/simulator protocol.
