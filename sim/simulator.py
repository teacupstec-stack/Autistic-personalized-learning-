"""
Learner Simulator for C2 Activity Selection.
Generates realistic interaction episodes across multiple response rule families.
Enforces all contract invariants, UTC ISO timestamps, and research safeguards.
"""
import copy
import math
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any

# Canonical 4 activity variants
CANONICAL_ACTIONS = [
    "easy_visual",
    "easy_text",
    "medium_visual",
    "medium_text"
]

def format_iso(dt: datetime) -> str:
    """Format canonical UTC ISO timestamp with exactly 3 fractional digits."""
    return dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')

def sigmoid(x: float) -> float:
    if x < -20:
        return 0.0
    if x > 20:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


class LearnerProfile:
    """Simulated learner with personalized response dynamics."""
    def __init__(
        self,
        profile_id: str,
        family: str,
        starting_skill: float,
        learning_rate: float,
        visual_preference: float, # positive prefers visual, negative prefers text
        break_tendency: float,
        distress_threshold: float,
        seed: int
    ):
        self.profile_id = profile_id
        self.family = family
        self.starting_skill = starting_skill
        self.current_skill = starting_skill
        self.learning_rate = learning_rate
        self.visual_preference = visual_preference
        self.break_tendency = break_tendency
        self.distress_threshold = distress_threshold
        self.seed = seed
        self.rng = random.Random(seed)
        self.consecutive_failures = 0
        self.consecutive_tasks_without_break = 0

    def reset_for_session(self, session_seed: int):
        self.rng = random.Random(session_seed)
        self.consecutive_failures = 0
        self.consecutive_tasks_without_break = 0

    def compute_success_probability(self, action_id: str) -> float:
        is_easy = "easy" in action_id
        is_visual = "visual" in action_id
        diff_val = 0.30 if is_easy else 0.65
        format_mod = self.visual_preference if is_visual else -self.visual_preference

        if self.family == "additive_skill":
            # Additive skill/difficulty logistic response
            z = 3.0 * (self.current_skill - diff_val) + format_mod
            p = sigmoid(z)
        elif self.family == "threshold_mastery":
            # Step/mastery threshold response with sharp transition
            margin = self.current_skill - diff_val + 0.1 * format_mod
            p = 0.88 if margin >= 0 else 0.22
        elif self.family == "fatigue_recovery":
            # Performance drops as consecutive tasks without break mount
            base_z = 3.0 * (self.current_skill - diff_val) + format_mod
            fatigue_penalty = 0.08 * min(self.consecutive_tasks_without_break, 6)
            p = max(0.10, sigmoid(base_z) - fatigue_penalty)
        else:
            p = sigmoid(2.0 * (self.current_skill - diff_val))

        return max(0.05, min(0.95, p))


class LearnerSimulator:
    """Manages simulated interaction sessions between a learner profile and C2."""

    def __init__(self, profile: LearnerProfile):
        self.profile = profile

    def run_session(
        self,
        session_id: str,
        num_steps: int,
        policy_fn,
        session_seed: int,
        start_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Runs a complete session of interaction steps.
        policy_fn takes (snapshot) -> action_id or None.
        Returns a list of linked (decision, outcome) event records.
        """
        self.profile.reset_for_session(session_seed)
        if start_time is None:
            start_time = datetime(2026, 10, 16, 9, 0, 0, tzinfo=timezone.utc)

        current_time = start_time
        records = []
        recent_results = []
        hint_history = []
        consecutive_failures = 0

        # Teacher boundaries
        teacher_limits = {
            "approved_actions": copy.deepcopy(CANONICAL_ACTIONS),
            "allowed_actions": copy.deepcopy(CANONICAL_ACTIONS),
            "max_failure_sequence": 3
        }

        for step in range(num_steps):
            decision_id = f"dec_{session_id}_{step}"
            current_time += timedelta(minutes=2)
            dec_time_str = format_iso(current_time)

            # 1. Spontaneous break check
            request_break = (
                self.profile.rng.random() < self.profile.break_tendency
                or self.profile.consecutive_tasks_without_break >= 8
            )
            confirmed_requests = []
            if request_break:
                confirmed_requests.append({
                    "kind": "break",
                    "confirmed_at": format_iso(current_time - timedelta(seconds=10))
                })
                # Break resets fatigue and bypasses C2 selection
                self.profile.consecutive_tasks_without_break = 0
                records.append({
                    "type": "break_event",
                    "decision_time": dec_time_str,
                    "session_id": session_id,
                    "learner_id": self.profile.profile_id,
                    "notes": "Break bypassed selection - no penalty"
                })
                current_time += timedelta(minutes=5)
                continue

            # 2. C3 Affective Risk Signal Generation
            # Generates fresh, expired, or missing risk signal
            c3_roll = self.profile.rng.random()
            c3_risk = None
            if c3_roll < 0.70:
                # Fresh signal
                observed_dt = current_time - timedelta(minutes=1)
                expires_dt = current_time + timedelta(minutes=2)
                # Risk is higher if consecutive failures are elevated
                raw_risk = min(0.95, max(0.05, 0.15 + 0.25 * consecutive_failures + self.profile.rng.uniform(-0.1, 0.1)))
                conf = round(self.profile.rng.uniform(0.70, 0.95), 2)
                c3_risk = {
                    "value": round(raw_risk, 3),
                    "confidence": conf,
                    "observed_at": format_iso(observed_dt),
                    "expires_at": format_iso(expires_dt)
                }
            elif c3_roll < 0.85:
                # Expired signal (observed 5 mins ago, expired 1 min ago)
                observed_dt = current_time - timedelta(minutes=5)
                expires_dt = current_time - timedelta(minutes=1)
                c3_risk = {
                    "value": 0.50,
                    "confidence": 0.80,
                    "observed_at": format_iso(observed_dt),
                    "expires_at": format_iso(expires_dt)
                }
            # else: missing (None)

            # 3. Assemble Snapshot
            # Filter allowed actions based on max failure limit
            eligible_actions = [
                a for a in teacher_limits["allowed_actions"]
                if consecutive_failures < teacher_limits["max_failure_sequence"]
            ]

            snapshot = {
                "snapshot_id": f"snap_{session_id}_{step}",
                "decision_time": dec_time_str,
                "skill_estimate": round(self.profile.current_skill, 3),
                "recent_results": copy.deepcopy(recent_results[-5:]),
                "hint_history": copy.deepcopy(hint_history[-5:]),
                "confirmed_requests": copy.deepcopy(confirmed_requests),
                "c3_risk": c3_risk,
                "teacher_limits": copy.deepcopy(teacher_limits)
            }

            # 4. Invoke Policy
            selected_action = policy_fn(snapshot, eligible_actions)
            self.profile.consecutive_tasks_without_break += 1

            # Decision Event
            decision_event = {
                "event_id": f"evt_dec_{session_id}_{step}",
                "decision_id": decision_id,
                "learner_id": self.profile.profile_id,
                "session_id": session_id,
                "decision_time": dec_time_str,
                "source": "simulated",
                "simulator_profile": {
                    "family": self.profile.family,
                    "profile_id": self.profile.profile_id,
                    "generator_version": "sim-v1",
                    "seed": self.profile.seed
                },
                "event_type": "decision",
                "context_before_action": copy.deepcopy(snapshot),
                "eligible_actions": copy.deepcopy(eligible_actions),
                "selected_action": selected_action,
                "action_propensity": None,
                "decision": {
                    "action_id": selected_action,
                    "eligible_actions": copy.deepcopy(eligible_actions),
                    "confidence": None,
                    "reason": "policy_selection" if selected_action else "teacher_intervention_required",
                    "model_version": "c2-v0.1.0"
                }
            }

            # If no action is eligible, trigger teacher intervention
            if selected_action is None:
                consecutive_failures = 0 # Teacher reviews and resets
                records.append({
                    "decision_event": decision_event,
                    "outcome_event": None,
                    "reward": 0.0,
                    "status": "teacher_intervention"
                })
                continue

            # 5. Simulate Outcome
            p_success = self.profile.compute_success_probability(selected_action)
            success = self.profile.rng.random() < p_success

            # Hints & Independence
            if success:
                consecutive_failures = 0
                hint_count = 0 if self.profile.rng.random() < 0.70 else 1
                independent = (hint_count == 0)
                distress = False
                # Skill updates conservatively
                self.profile.current_skill = min(1.0, self.profile.current_skill + self.profile.learning_rate * 0.4)
            else:
                consecutive_failures += 1
                hint_count = self.profile.rng.randint(1, 4)
                independent = False
                distress = (
                    consecutive_failures >= 2
                    or (c3_risk is not None and c3_risk["value"] > self.profile.distress_threshold)
                )

            # Record in history
            outcome_dt = current_time + timedelta(seconds=45)
            outcome_time_str = format_iso(outcome_dt)

            recent_results.append({
                "decision_id": decision_id,
                "outcome_time": outcome_time_str,
                "success": success,
                "independent": independent
            })
            if hint_count > 0:
                hint_history.append({
                    "time": outcome_time_str,
                    "count": hint_count
                })

            # Outcome Event
            outcome_event = {
                "event_id": f"evt_out_{session_id}_{step}",
                "decision_id": decision_id,
                "learner_id": self.profile.profile_id,
                "session_id": session_id,
                "decision_time": dec_time_str,
                "source": "simulated",
                "simulator_profile": {
                    "family": self.profile.family,
                    "profile_id": self.profile.profile_id,
                    "generator_version": "sim-v1",
                    "seed": self.profile.seed
                },
                "event_type": "outcome",
                "outcome_time": outcome_time_str,
                "selected_action": selected_action,
                "outcome": success,
                "independence": independent,
                "override": False,
                "distress_annotation": {"present": distress, "annotator": "simulator"} if distress else None
            }

            # 6. Calculate Bounded Reward
            # reward = clip(0.7*success + 0.3*independent - 0.05*min(hints,4) - 0.30*(distress), -1.0, 1.0)
            hint_pen = 0.05 * min(hint_count, 4)
            dist_pen = 0.30 if distress else 0.0
            raw_reward = (0.7 * (1.0 if success else 0.0) +
                          0.3 * (1.0 if independent else 0.0) -
                          hint_pen - dist_pen)
            reward = max(-1.0, min(1.0, raw_reward))

            records.append({
                "decision_event": decision_event,
                "outcome_event": outcome_event,
                "reward": reward,
                "p_success": p_success,
                "status": "completed"
            })

        return records
