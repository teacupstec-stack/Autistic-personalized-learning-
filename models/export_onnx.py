"""
Export Context-only Neural Response Encoder to ONNX and JSON format.
Enables offline browser execution via ONNX Runtime Web / WebAssembly.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def export_to_onnx():
    models_dir = ROOT / "models"
    weights_path = models_dir / "model_weights.json"
    onnx_path = models_dir / "context_encoder.onnx"

    if not weights_path.exists():
        print("Error: model_weights.json not found. Run train/train_response.py first.")
        return

    with open(weights_path, "r") as f:
        weights = json.load(f)

    # Check for PyTorch
    try:
        import torch
        import torch.nn as nn

        class PyTorchEncoder(nn.Module):
            def __init__(self, w):
                super().__init__()
                self.fc1 = nn.Linear(w["in_dim"], w["h1_dim"])
                self.fc2 = nn.Linear(w["h1_dim"], w["h2_dim"])
                self.relu = nn.ReLU()

                # Load weights
                with torch.no_grad():
                    self.fc1.weight.copy_(torch.tensor(w["W1"]).t())
                    self.fc1.bias.copy_(torch.tensor(w["b1"]))
                    self.fc2.weight.copy_(torch.tensor(w["W2"]).t())
                    self.fc2.bias.copy_(torch.tensor(w["b2"]))

            def forward(self, x):
                h1 = self.relu(self.fc1(x))
                h2 = self.relu(self.fc2(h1))
                return h2

        model = PyTorchEncoder(weights)
        model.eval()

        dummy_input = torch.randn(1, weights["in_dim"], dtype=torch.float32)
        try:
            torch.onnx.export(
                model,
                dummy_input,
                str(onnx_path),
                export_params=True,
                opset_version=14,
                do_constant_folding=True,
                input_names=["context_features"],
                output_names=["latent_phi"],
                dynamic_axes={"context_features": {0: "batch_size"}, "latent_phi": {0: "batch_size"}}
            )
            print(f"Successfully exported neural encoder -> {onnx_path.name}")
        except Exception as e:
            print(f"ONNX export via torch encountered: {e}. Graph JSON remains available.")
    except ImportError:
        print("PyTorch not installed in current environment.")

    # Always generate Browser-compatible Wasm/JSON Model format
    browser_model_path = models_dir / "browser_model.json"
    with open(browser_model_path, "w") as f:
        json.dump({
            "model_type": "ContextEncoderMLP",
            "version": "1.0.0",
            "weights": weights,
            "runtime": "onnx_web_ready"
        }, f, indent=2)
    print(f"Saved browser-ready model definition -> {browser_model_path.name}")

if __name__ == "__main__":
    export_to_onnx()
