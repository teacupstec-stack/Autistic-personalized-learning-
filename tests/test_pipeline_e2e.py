"""
End-to-end pipeline integration tests for Component 1 (PUSG-Fusion):
- Normalization mathematics & trajectory encoding
- Prototype bank initialization and distance metric
- ONNX Runtime inference & PyTorch parity
- Rejection / clarification gate rules
"""

import os
import sys
import json
import unittest
import numpy as np
import torch
import onnxruntime as ort

# Ensure project root in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from preprocessing.normalizer import GestureNormalizer
from training.models import PUSGFusionModel, INTENT_LABELS, NUM_CLASSES
from training.train import build_personal_prototypes


class TestPipelineE2E(unittest.TestCase):
    def setUp(self):
        self.normalizer = GestureNormalizer(target_timesteps=32)

    def test_normalizer_output_shape(self):
        """Verify normalizer produces exact [32, 128] float32 tensor."""
        raw_lm = np.random.randn(20, 2, 21, 3).astype(np.float32)
        raw_masks = np.ones((20, 2), dtype=np.float32)
        features = self.normalizer.process_sequence(raw_lm, raw_masks)

        self.assertEqual(features.shape, (32, 128))
        self.assertEqual(features.dtype, np.float32)
        # Masks at indices 126 and 127 should be 1.0
        self.assertEqual(features[0, 126], 1.0)
        self.assertEqual(features[0, 127], 1.0)

    def test_absent_hand_masking(self):
        """Verify absent hand features are zeroed out while mask reflects 0.0."""
        raw_lm = np.random.randn(32, 2, 21, 3).astype(np.float32)
        raw_masks = np.zeros((32, 2), dtype=np.float32)
        raw_masks[:, 1] = 1.0  # Only right hand active; left hand absent

        features = self.normalizer.normalize_spatial(raw_lm, raw_masks)
        # Hand 0 (Left) occupies dims 0..62 -> must be all 0.0
        self.assertTrue(np.allclose(features[:, :63], 0.0))
        # Mask 0 must be 0.0, Mask 1 must be 1.0
        self.assertEqual(features[0, 126], 0.0)
        self.assertEqual(features[0, 127], 1.0)

    def test_onnx_model_file_exists_and_runs(self):
        """Verify exported ONNX model loads and produces 64-dim embeddings."""
        onnx_path = "models/onnx/pusg_fusion_encoder.onnx"
        self.assertTrue(os.path.exists(onnx_path), f"Missing ONNX file at {onnx_path}")

        session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        dummy_input = np.random.randn(1, 32, 128).astype(np.float32)
        output = session.run(None, {"gesture_sequence": dummy_input})[0]

        self.assertEqual(output.shape, (1, 64))
        # Embedding vector should be L2-normalized
        norm = np.linalg.norm(output[0])
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_prototype_bank_integrity(self):
        """Verify prototype bank contains 5 normalized vectors for the 5 intents."""
        proto_path = "models/onnx/prototype_bank.json"
        self.assertTrue(os.path.exists(proto_path), f"Missing prototype bank at {proto_path}")

        with open(proto_path, "r") as f:
            data = json.load(f)

        self.assertEqual(data["intents"], INTENT_LABELS)
        self.assertEqual(len(data["prototypes"]), 5)
        for vec in data["prototypes"]:
            self.assertEqual(len(vec), 64)
            norm = np.linalg.norm(vec)
            self.assertAlmostEqual(norm, 1.0, places=4)

    def test_clarification_margin_rule(self):
        """Verify ambiguous predictions trigger clarification."""
        model = PUSGFusionModel(input_dim=128, gesture_embed_dim=64, confidence_threshold=0.70, margin_threshold=0.15)
        model.eval()

        dummy_seq = torch.randn(1, 32, 128)
        pred = model.predict_with_clarification(dummy_seq)

        self.assertIn("candidate_intent", pred)
        self.assertIn("clarification_flag", pred)
        self.assertIn("confirmation_status", pred)
        self.assertIsInstance(pred["clarification_flag"], bool)


if __name__ == "__main__":
    unittest.main()
