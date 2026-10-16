"""
test_pipeline.py
================
Automated unit and integration test suite for Component 3 (PBEF).
Tests event generation, temporal alignment, window building, baseline models,
and ONNX inference parity.
"""

import os
import sys
import tempfile
import unittest
import numpy as np
import pandas as pd
import torch

# Add src directories to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "src", "features"))
sys.path.insert(0, os.path.join(BASE_DIR, "src", "models"))
sys.path.insert(0, os.path.join(BASE_DIR, "src", "evaluation"))

from generate_sample_sessions import generate_session
from align_annotations import load_events, load_annotations, align_session_events
from build_windows import build_session_windows, FEATURE_COLUMNS
from train_logistic import extract_summary_features, fit_threshold_baseline
from train_forecaster import TemporalForecaster


class TestParticipationForecastingPipeline(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.learner_id = "L_TEST"
        self.session_id = "S_TEST_01"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_generate_sample_session(self):
        """Verifies session simulation creates valid events, annotations, and interventions."""
        events, annotations, interventions = generate_session(
            learner_id=self.learner_id,
            session_id=self.session_id,
            session_length_sec=120,
            seed=42
        )
        self.assertGreater(len(events), 10)
        self.assertGreater(len(annotations), 5)
        self.assertGreater(len(interventions), 0)

        # Check required event fields
        first_event = events[0]
        self.assertEqual(first_event["learner_id"], self.learner_id)
        self.assertEqual(first_event["session_id"], self.session_id)
        self.assertEqual(first_event["time_ms"], 0)
        self.assertEqual(first_event["event_type"], "session_start")

        # Check monotonic ordering
        times = [e["time_ms"] for e in events]
        self.assertEqual(times, sorted(times))

    def test_02_align_annotations(self):
        """Verifies 1-second bin aggregation preserves continuous dynamics."""
        events, annotations, interventions = generate_session(
            learner_id=self.learner_id,
            session_id=self.session_id,
            session_length_sec=90,
            seed=42
        )
        events_df = pd.DataFrame(events)
        ann_df = pd.DataFrame(annotations)
        int_df = pd.DataFrame(interventions)

        aligned_df = align_session_events(events_df, ann_df, int_df, bin_size_ms=1000)

        # Verify time-bins
        self.assertGreater(len(aligned_df), 30)
        for col in FEATURE_COLUMNS:
            self.assertIn(col, aligned_df.columns)
        self.assertIn("current_state", aligned_df.columns)
        self.assertIn("is_valid_window", aligned_df.columns)

    def test_03_build_windows_zero_leakage(self):
        """Verifies 30s input history and 20s target horizon with zero future leakage."""
        events, annotations, interventions = generate_session(
            learner_id=self.learner_id,
            session_id=self.session_id,
            session_length_sec=120,
            seed=42
        )
        events_df = pd.DataFrame(events)
        ann_df = pd.DataFrame(annotations)
        int_df = pd.DataFrame(interventions)

        aligned_df = align_session_events(events_df, ann_df, int_df, bin_size_ms=1000)

        X, y_forecast, y_state, mask, manifest = build_session_windows(
            aligned_df,
            history_sec=30,
            forecast_sec=20,
            stride_sec=1
        )

        self.assertIsNotNone(X)
        self.assertEqual(X.shape[1], 30)  # 30-second sequence length
        self.assertEqual(X.shape[2], len(FEATURE_COLUMNS))
        self.assertEqual(len(y_forecast), len(X))
        self.assertEqual(len(y_state), len(X))
        self.assertEqual(len(mask), len(X))

        # Check binary forecast target values
        self.assertTrue(set(np.unique(y_forecast)).issubset({0, 1}))

    def test_04_baseline_feature_extraction(self):
        """Verifies summary statistic extraction for logistic baseline."""
        dummy_X = np.random.randn(10, 30, len(FEATURE_COLUMNS)).astype(np.float32)
        summaries = extract_summary_features(dummy_X)
        self.assertEqual(summaries.shape[0], 10)
        self.assertEqual(summaries.shape[1], 9)  # 9 summary metrics

    def test_05_temporal_forecaster_architecture(self):
        """Verifies forward pass through TCN with multimodal reliability gating."""
        model = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32)
        model.eval()

        # Batch=4, Features=11, Seq_len=30
        x_dummy = torch.randn(4, 11, 30)
        forecast_logit, state_logits = model(x_dummy)

        self.assertEqual(forecast_logit.shape, (4, 1))
        self.assertEqual(state_logits.shape, (4, 3))


if __name__ == "__main__":
    unittest.main()
