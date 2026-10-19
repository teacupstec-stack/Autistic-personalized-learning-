"""
Baseline Policies for C2 Constrained Activity Selection.
1. Fixed Sequencing: Deterministic curriculum cycling.
2. Educator Rules: Pedagogical rule-based heuristic with teacher constraints.
"""
from typing import Dict, List, Optional, Any

class FixedSequencingPolicy:
    """Cycles deterministically through allowed actions."""
    def __init__(self, action_order: Optional[List[str]] = None):
        self.name = "Fixed_Sequencing"
        self.action_order = action_order or [
            "easy_visual",
            "easy_text",
            "medium_visual",
            "medium_text"
        ]
        self.idx = 0

    def reset(self):
        self.idx = 0

    def select_action(self, snapshot: Dict[str, Any], eligible_actions: List[str]) -> Optional[str]:
        if not eligible_actions:
            return None
        # Find next available action in order
        for _ in range(len(self.action_order)):
            candidate = self.action_order[self.idx % len(self.action_order)]
            self.idx += 1
            if candidate in eligible_actions:
                return candidate
        return eligible_actions[0]

    def update(self, snapshot: Dict[str, Any], action_id: str, reward: float):
        pass # Non-adaptive


class EducatorRulesPolicy:
    """
    Heuristic educator rules:
    - Starts with easy visual.
    - If student succeeds independently, steps up to medium or text.
    - If student struggles or C3 risk is high, retreats to easy visual.
    - Strictly respects teacher limits and consecutive failure tripwire.
    """
    def __init__(self):
        self.name = "Educator_Rules"

    def reset(self):
        pass

    def select_action(self, snapshot: Dict[str, Any], eligible_actions: List[str]) -> Optional[str]:
        if not eligible_actions:
            return None

        recent = snapshot.get("recent_results", [])
        last_success = recent[-1].get("success", False) if recent else True
        last_indep = recent[-1].get("independent", False) if recent else True

        # Check C3 risk
        risk = snapshot.get("c3_risk")
        high_risk = risk is not None and risk.get("value", 0.0) >= 0.60

        # Heuristic decision tree
        if high_risk or not last_success:
            # Gentle presentation
            preferred = ["easy_visual", "easy_text", "medium_visual", "medium_text"]
        elif last_success and last_indep:
            # Advance to medium
            preferred = ["medium_visual", "medium_text", "easy_text", "easy_visual"]
        else:
            preferred = ["easy_text", "medium_visual", "easy_visual", "medium_text"]

        for action in preferred:
            if action in eligible_actions:
                return action

        return eligible_actions[0]

    def update(self, snapshot: Dict[str, Any], action_id: str, reward: float):
        pass # Rule-based heuristic
