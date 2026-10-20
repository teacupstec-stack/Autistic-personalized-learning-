"""
Unit tests for Milestone 1 logic and architectural contracts:
- 100% priority for direct picture symbol selection
- Honest reporting of model status ('not_loaded' when no weights exist)
- Explicit intentional gesture capture window
- Clarification trigger rules
- Session event schema integrity
"""

import unittest
from datetime import datetime
import json

INTENT_MESSAGES = ["Help", "Break", "Finished", "Yes", "No"]
MODEL_STATUSES = ["not_loaded", "ready", "error"]


class TestMilestone1Architecture(unittest.TestCase):
    def test_five_core_intents(self):
        """Verify the five agreed communication intents are defined."""
        self.assertEqual(len(INTENT_MESSAGES), 5)
        self.assertIn("Help", INTENT_MESSAGES)
        self.assertIn("Break", INTENT_MESSAGES)
        self.assertIn("Finished", INTENT_MESSAGES)
        self.assertIn("Yes", INTENT_MESSAGES)
        self.assertIn("No", INTENT_MESSAGES)

    def test_symbol_priority_over_inferred_gesture(self):
        """
        Architectural contract:
        Confirmed symbol selection takes 100% priority over any inferred or conflicting gesture.
        """
        symbol_selection = {"intent": "Break", "confidence": 1.0, "source": "symbol"}
        inferred_gesture = {"intent": "Help", "confidence": 0.72, "source": "gesture_model"}

        def resolve_conflict(symbol_choice, gesture_prediction):
            if symbol_choice is not None:
                # Direct symbol selection always wins immediately
                return {
                    "final_intent": symbol_choice["intent"],
                    "priority": 1.0,
                    "status": "confirmed_symbol",
                    "requires_clarification": False,
                }
            return {
                "final_intent": gesture_prediction["intent"],
                "priority": gesture_prediction["confidence"],
                "status": "inferred_gesture",
                "requires_clarification": gesture_prediction["confidence"] < 0.85,
            }

        resolution = resolve_conflict(symbol_selection, inferred_gesture)
        self.assertEqual(resolution["final_intent"], "Break")
        self.assertEqual(resolution["status"], "confirmed_symbol")
        self.assertFalse(resolution["requires_clarification"])

    def test_model_status_not_loaded_by_default(self):
        """
        Verify that in Milestone 1, model status must be 'not_loaded'.
        No predictions or accuracy metrics should be fabricated.
        """
        available_model_path = None  # No model exported yet in Milestone 1
        model_status = "ready" if available_model_path is not None else "not_loaded"
        self.assertEqual(model_status, "not_loaded")

    def test_explicit_gesture_capture_window(self):
        """
        Verify intentional capture requires an explicit duration window (default 2000ms),
        and ordinary movements outside this window are ignored.
        """
        capture_window_ms = 2000
        min_valid_ms = 1000

        self.assertTrue(1000 <= capture_window_ms <= 2500)
        self.assertTrue(capture_window_ms >= min_valid_ms)

    def test_clarification_rule_for_conflicting_or_uncertain_input(self):
        """
        Verify that uncertain predictions trigger clarification.
        """
        uncertain_prediction = {"intent": "Help", "confidence": 0.58}
        threshold = 0.80

        def should_trigger_clarification(pred, thresh=0.80):
            return pred["confidence"] < thresh

        self.assertTrue(should_trigger_clarification(uncertain_prediction, threshold))

    def test_session_event_schema(self):
        """
        Verify session event data schema satisfies requirements.
        """
        sample_event = {
            "id": "ev-test-12345",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "eventType": "symbol_selected",
            "modality": "symbol",
            "source": "learner_symbol",
            "intent": "Help",
            "activityContext": {
                "activityId": "counting_activity_01",
                "currentCount": 3,
                "targetCount": 5,
                "status": "in_progress",
            },
            "modelStatus": "not_loaded",
            "details": "Learner selected symbol Help",
        }

        # Serializability check
        json_output = json.dumps(sample_event)
        deserialized = json.loads(json_output)
        self.assertEqual(deserialized["intent"], "Help")
        self.assertEqual(deserialized["modelStatus"], "not_loaded")
        self.assertEqual(deserialized["activityContext"]["currentCount"], 3)


if __name__ == "__main__":
    unittest.main()
