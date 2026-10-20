"""
ONNX export and parity check script for PUSG-Fusion (Component 1).

Exports:
1. TemporalGestureEncoder to models/onnx/pusg_fusion_encoder.onnx
2. Personal prototype vectors to models/onnx/prototype_bank.json
3. Validates numerical parity between PyTorch and ONNX Runtime (tol < 1e-4).
4. Copies model assets to frontend/public/models/ for offline in-browser inference.
"""

import os
import sys
import json
import shutil
import numpy as np
import torch
import onnx
import onnxruntime as ort

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from training.models import PUSGFusionModel, INTENT_LABELS, NUM_CLASSES
from training.train import load_dataset_and_splits, build_personal_prototypes


class ExportableGestureEncoder(torch.nn.Module):
    """Wrapper that only exports the temporal gesture encoder."""
    def __init__(self, full_model: PUSGFusionModel):
        super().__init__()
        self.encoder = full_model.gesture_encoder

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, 32, 128] -> [B, 64]
        return self.encoder(x)


def export_and_verify():
    checkpoint_path = "models/checkpoints/pusg_fusion_best.pt"
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint not found at {checkpoint_path}. Train model first.")

    os.makedirs("models/onnx", exist_ok=True)
    onnx_output_path = "models/onnx/pusg_fusion_encoder.onnx"
    proto_output_path = "models/onnx/prototype_bank.json"

    device = torch.device("cpu")
    checkpoint = torch.load(checkpoint_path, map_location=device)

    full_model = PUSGFusionModel(
        input_dim=128,
        gesture_embed_dim=64,
        confidence_threshold=0.70,
        margin_threshold=0.15
    )
    full_model.load_state_dict(checkpoint["model_state_dict"])
    full_model.eval()

    # Load enrolment samples to populate prototype bank
    enrolment_samples, _, _, test_samples = load_dataset_and_splits(
        "data/processed/d1_synthetic_dataset.json",
        "data/processed/split_manifest.json"
    )
    build_personal_prototypes(full_model, enrolment_samples, device)

    # Save prototype bank as JSON
    proto_bank = {
        "intents": INTENT_LABELS,
        "model_version": "1.0.0",
        "confidence_threshold": 0.70,
        "margin_threshold": 0.15,
        "prototypes": full_model.personal_prototypes.cpu().numpy().tolist()
    }
    with open(proto_output_path, "w") as f:
        json.dump(proto_bank, f, indent=2)
    print(f"Prototype bank saved to {proto_output_path}")

    # Prepare model wrapper for ONNX export
    exportable = ExportableGestureEncoder(full_model)
    exportable.eval()

    dummy_input = torch.randn(1, 32, 128, dtype=torch.float32)

    # Export to ONNX
    torch.onnx.export(
        exportable,
        dummy_input,
        onnx_output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["gesture_sequence"],
        output_names=["gesture_embedding"],
        dynamic_axes={
            "gesture_sequence": {0: "batch_size"},
            "gesture_embedding": {0: "batch_size"},
        }
    )
    print(f"Exported ONNX model to {onnx_output_path}")

    # Verify ONNX model validity with onnx package
    onnx_model = onnx.load(onnx_output_path)
    onnx.checker.check_model(onnx_model)
    print("ONNX structure validation: PASSED")

    # Run Numerical Parity Check
    ort_session = ort.InferenceSession(onnx_output_path, providers=["CPUExecutionProvider"])

    test_feat = np.array(test_samples[0]["features"], dtype=np.float32)[np.newaxis, ...]  # [1, 32, 128]

    # PyTorch output
    with torch.no_grad():
        py_tensor = torch.tensor(test_feat, dtype=torch.float32)
        py_output = exportable(py_tensor).cpu().numpy()

    # ONNX Runtime output
    ort_inputs = {"gesture_sequence": test_feat}
    ort_output = ort_session.run(None, ort_inputs)[0]

    max_diff = np.max(np.abs(py_output - ort_output))
    print(f"Parity check: max difference = {max_diff:.8e}")
    assert max_diff < 1e-4, f"Parity check failed: max diff {max_diff} exceeds tolerance 1e-4"
    print("Numerical parity check between PyTorch and ONNX Runtime: PASSED (tolerance < 1e-4)")

    # Copy to frontend/public/models/ for browser offline inference
    frontend_models_dir = "frontend/public/models"
    os.makedirs(frontend_models_dir, exist_ok=True)
    shutil.copy(onnx_output_path, os.path.join(frontend_models_dir, "pusg_fusion_encoder.onnx"))
    shutil.copy(proto_output_path, os.path.join(frontend_models_dir, "prototype_bank.json"))
    print(f"Copied model assets to {frontend_models_dir} for browser inference.")


if __name__ == "__main__":
    export_and_verify()
