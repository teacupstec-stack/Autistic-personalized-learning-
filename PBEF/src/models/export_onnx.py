"""
export_onnx.py
==============
Component 3 (Participation Forecasting - PBEF)
Exports trained PyTorch TemporalForecaster model to ONNX format
and validates output alignment against PyTorch reference inference.

INPUTS:
  --checkpoint_file: Path to trained PyTorch weights (model.pt)
  --output_onnx:     Path to output model.onnx (default: models/tcn_forecaster/model.onnx)
  --opset_version:   ONNX opset version (default: 16)

OUTPUTS:
  - model.onnx with dynamic batch axes
  - Parity validation log comparing PyTorch vs ONNX Runtime inference
"""

import os
import sys
import argparse
import numpy as np
import torch

from train_forecaster import TemporalForecaster


def export_to_onnx(
    checkpoint_path: str,
    output_onnx_path: str,
    opset_version: int = 16
):
    print(f"[export_onnx] Loading checkpoint from: {checkpoint_path}")
    model = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32)
    
    if os.path.exists(checkpoint_path):
        state_dict = torch.load(checkpoint_path, map_location='cpu')
        model.load_state_dict(state_dict)
    else:
        print(f"[export_onnx] Warning: Checkpoint not found at {checkpoint_path}. Exporting initialized architecture.")

    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    model.eval()

    # Dummy input: [Batch=1, Features=11, Seq_len=30]
    dummy_input = torch.randn(1, 11, 30, dtype=torch.float32)

    os.makedirs(os.path.dirname(os.path.abspath(output_onnx_path)), exist_ok=True)

    print(f"[export_onnx] Exporting ONNX graph (opset {opset_version})...")
    torch.onnx.export(
        model,
        dummy_input,
        output_onnx_path,
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=['input_features'],
        output_names=['forecast_logit', 'state_logits'],
        dynamic_axes={
            'input_features': {0: 'batch_size'},
            'forecast_logit': {0: 'batch_size'},
            'state_logits': {0: 'batch_size'}
        },
        dynamo=False
    )
    print(f"[export_onnx] Saved ONNX model to: {output_onnx_path}")

    # Verify parity using onnxruntime if available across multiple test cases
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(output_onnx_path, providers=['CPUExecutionProvider'])
        input_name = session.get_inputs()[0].name

        test_cases = [
            ("Batch size 1 (Standard Random)", torch.randn(1, 11, 30, dtype=torch.float32)),
            ("Batch size 4 (Multi-sample Batch)", torch.randn(4, 11, 30, dtype=torch.float32)),
            ("Batch size 16 (Full Batch)", torch.randn(16, 11, 30, dtype=torch.float32)),
            ("Missing Camera Fallback (Visual Masked)", torch.randn(2, 11, 30, dtype=torch.float32)),
            ("Zero Input Edge Case (Cold-Start)", torch.zeros(1, 11, 30, dtype=torch.float32)),
        ]
        # Set visual channels to 0 for missing camera test case
        test_cases[3][1][:, 8:, :] = 0.0

        print(f"[export_onnx] Running ONNX Runtime Multi-Case Numerical Parity Verification:")
        for name, tensor_in in test_cases:
            ort_inputs = {input_name: tensor_in.numpy()}
            ort_outs = session.run(None, ort_inputs)

            with torch.no_grad():
                torch_f, torch_s = model(tensor_in)

            diff_f = np.max(np.abs(torch_f.numpy() - ort_outs[0]))
            diff_s = np.max(np.abs(torch_s.numpy() - ort_outs[1]))
            max_diff = max(diff_f, diff_s)
            assert max_diff < 1e-4, f"High divergence in {name}: {max_diff}"
            print(f"  - [{name}] Max abs diff: {max_diff:.6e} (PASS)")

        print("  => All test cases verified: PyTorch and ONNX Runtime outputs match within tolerance.")
    except ImportError:
        print("[export_onnx] Note: onnxruntime not installed in active environment, skipped runtime verification.")


def main():
    parser = argparse.ArgumentParser(description="Export PyTorch Temporal Forecaster to ONNX.")
    parser.add_argument("--checkpoint_file", type=str, default="models/tcn_forecaster/model.pt", help="PyTorch model.pt path")
    parser.add_argument("--output_onnx", type=str, default="models/tcn_forecaster/model.onnx", help="Target ONNX file path")
    parser.add_argument("--opset_version", type=int, default=16, help="ONNX opset version")

    args = parser.parse_args()
    export_to_onnx(args.checkpoint_file, args.output_onnx, args.opset_version)


if __name__ == "__main__":
    main()
