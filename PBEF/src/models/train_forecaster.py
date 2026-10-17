"""
train_forecaster.py
===================
Component 3 (Participation Forecasting - PBEF)
Temporal Convolutional Network (TCN) with Multimodal Reliability Gating
and Dual-Task Heads (Current State Classification + 20s Future Onset Forecasting).

ARCHITECTURE:
  1. Interaction Temporal Encoder: 2-layer Conv1D (32 channels) over 30s interaction history.
  2. Optional Visual Temporal Encoder: Conv1D (16 channels) over head-pose/presence.
  3. Modality Reliability Gate: Dynamically suppresses camera embedding when visual data
     is absent or masked, ensuring robust interaction-only fallback.
  4. Dual Output Heads:
     - Head 1: Future Onset Forecasting (20-second horizon) -> Sigmoid Risk Score.
     - Head 2: Current Participation State Classification -> 3-class Logits.

INPUTS:
  --data_file:      Path to windows.npz (from build_windows.py)
  --manifest_file:  Path to window_manifest.csv
  --output_dir:     Checkpoint & artifacts destination (default: models/tcn_forecaster)
  --epochs:         Maximum training epochs (default: 40)
  --batch_size:     Batch size (default: 16)
  --lr:             Learning rate (default: 0.001)

OUTPUTS:
  - model.pt: Best validation PyTorch model weights
  - config.json: Model hyperparameters and architecture definition
  - metrics.json: Validation PR-AUC, ROC-AUC, F1, lead time, and false alerts
  - preprocessing.json: Normalization statistics and feature order
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import average_precision_score, roc_auc_score, f1_score, precision_score, recall_score


class ParticipationDataset(Dataset):
    def __init__(self, X: np.ndarray, y_forecast: np.ndarray, y_state: np.ndarray):
        # Transpose X from [N, T, F] to [N, F, T] for PyTorch 1D Convolutions
        self.X = torch.tensor(X, dtype=torch.float32).permute(0, 2, 1)
        self.y_forecast = torch.tensor(y_forecast, dtype=torch.float32).unsqueeze(1)
        self.y_state = torch.tensor(y_state, dtype=torch.long)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y_forecast[idx], self.y_state[idx]


class TemporalForecaster(nn.Module):
    def __init__(
        self,
        interaction_dim: int = 8,
        visual_dim: int = 3,
        num_classes: int = 3,
        conv_channels: int = 32,
        use_gate: bool = True
    ):
        super().__init__()
        self.interaction_dim = interaction_dim
        self.visual_dim = visual_dim
        self.use_gate = use_gate

        # 1. Interaction Temporal Convolutional Encoder
        self.interaction_encoder = nn.Sequential(
            nn.Conv1d(interaction_dim, conv_channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(conv_channels),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Conv1d(conv_channels, conv_channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(conv_channels),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1)
        )

        if visual_dim > 0:
            # 2. Optional Visual Temporal Encoder
            self.visual_encoder = nn.Sequential(
                nn.Conv1d(visual_dim, 16, kernel_size=3, padding=1),
                nn.BatchNorm1d(16),
                nn.ReLU(),
                nn.AdaptiveAvgPool1d(1)
            )

            # 3. Reliability Gate
            if use_gate:
                self.gate_fc = nn.Sequential(
                    nn.Linear(conv_channels + 16, 16),
                    nn.Sigmoid()
                )
            else:
                self.gate_fc = None
            combined_dim = conv_channels + 16
        else:
            self.visual_encoder = None
            self.gate_fc = None
            combined_dim = conv_channels

        # 4. Future Onset Forecasting Head (Binary logit for 20s horizon)
        self.forecast_head = nn.Sequential(
            nn.Linear(combined_dim, 24),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(24, 1)
        )

        # 5. Current State Classification Head (3 classes)
        self.state_head = nn.Sequential(
            nn.Linear(combined_dim, 16),
            nn.ReLU(),
            nn.Linear(16, num_classes)
        )

    def forward(self, x: torch.Tensor):
        x_int = x[:, :self.interaction_dim, :]
        h_int = self.interaction_encoder(x_int).squeeze(2)

        if self.visual_dim > 0:
            x_vis = x[:, self.interaction_dim:self.interaction_dim + self.visual_dim, :]
            h_vis = self.visual_encoder(x_vis).squeeze(2)

            if self.use_gate:
                vis_valid_mask = torch.mean(x_vis[:, 0:1, :], dim=2)
                gate_input = torch.cat([h_int, h_vis], dim=1)
                gate_weight = self.gate_fc(gate_input) * vis_valid_mask
                gated_vis = h_vis * gate_weight
            else:
                gated_vis = h_vis

            h_combined = torch.cat([h_int, gated_vis], dim=1)
        else:
            h_combined = h_int

        forecast_logit = self.forecast_head(h_combined)
        state_logits = self.state_head(h_combined)

        return forecast_logit, state_logits


def train_model(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    pos_weight: float = 1.0,
    state_loss_weight: float = 0.3,
    epochs: int = 40,
    lr: float = 0.001
):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model.to(device)

    criterion_forecast = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([pos_weight]).to(device))
    criterion_state = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_val_pr_auc = -1.0
    best_weights = None
    best_metrics = {}

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0

        for x_b, y_f, y_s in train_loader:
            x_b, y_f, y_s = x_b.to(device), y_f.to(device), y_s.to(device)

            optimizer.zero_grad()
            out_f, out_s = model(x_b)

            loss_f = criterion_forecast(out_f, y_f)
            loss_s = criterion_state(out_s, y_s)
            loss = loss_f + state_loss_weight * loss_s

            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # Validation phase
        model.eval()
        val_f_preds, val_f_trues = [], []
        with torch.no_grad():
            for x_b, y_f, y_s in val_loader:
                x_b = x_b.to(device)
                out_f, _ = model(x_b)
                probs = torch.sigmoid(out_f).cpu().numpy().flatten()
                val_f_preds.extend(probs)
                val_f_trues.extend(y_f.numpy().flatten())

        val_f_preds = np.array(val_f_preds)
        val_f_trues = np.array(val_f_trues)

        # Calculate PR-AUC
        if len(np.unique(val_f_trues)) > 1:
            val_pr_auc = average_precision_score(val_f_trues, val_f_preds)
            val_roc_auc = roc_auc_score(val_f_trues, val_f_preds)
        else:
            val_pr_auc = 0.0
            val_roc_auc = 0.5

        if val_pr_auc > best_val_pr_auc:
            import copy
            best_val_pr_auc = val_pr_auc
            best_weights = copy.deepcopy(model.state_dict())
            binary_preds = (val_f_preds >= 0.5).astype(int)
            best_metrics = {
                'epoch': epoch,
                'val_pr_auc': round(float(val_pr_auc), 4),
                'val_roc_auc': round(float(val_roc_auc), 4),
                'f1_score': round(float(f1_score(val_f_trues, binary_preds, zero_division=0)), 4),
                'precision': round(float(precision_score(val_f_trues, binary_preds, zero_division=0)), 4),
                'recall': round(float(recall_score(val_f_trues, binary_preds, zero_division=0)), 4),
            }

    if best_weights:
        model.load_state_dict(best_weights)

    return model, best_metrics


def main():
    parser = argparse.ArgumentParser(description="Train Temporal Forecaster with Reliability Gating.")
    parser.add_argument("--data_file", type=str, required=True, help="Path to windows.npz")
    parser.add_argument("--manifest_file", type=str, required=True, help="Path to window_manifest.csv")
    parser.add_argument("--output_dir", type=str, default="models/tcn_forecaster", help="Save directory")
    parser.add_argument("--epochs", type=int, default=35, help="Number of epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")

    args = parser.parse_args()

    npz = np.load(args.data_file)
    X = npz['X']
    y_forecast = npz['y_forecast']
    y_state = npz['y_state']
    mask = npz['mask']

    manifest = pd.read_csv(args.manifest_file)
    valid_idx = np.where(mask == 1)[0]
    X_valid = X[valid_idx]
    y_f_valid = y_forecast[valid_idx]
    y_s_valid = y_state[valid_idx]
    manifest_valid = manifest.iloc[valid_idx].reset_index(drop=True)

    # Participant-level split
    unique_learners = manifest_valid['learner_id'].unique()
    np.random.seed(42)
    shuffled_learners = np.random.permutation(unique_learners)
    split_pt = max(1, int(len(shuffled_learners) * 0.75))

    if len(unique_learners) <= 1:
        unique_sessions = manifest_valid['session_id'].unique()
        split_pt = max(1, int(len(unique_sessions) * 0.75))
        train_sessions = set(unique_sessions[:split_pt])
        train_mask = manifest_valid['session_id'].isin(train_sessions).to_numpy()
    else:
        train_learners = set(shuffled_learners[:split_pt])
        train_mask = manifest_valid['learner_id'].isin(train_learners).to_numpy()

    test_mask = ~train_mask
    if np.sum(test_mask) == 0:
        n_train = int(len(X_valid) * 0.75)
        train_mask = np.zeros(len(X_valid), dtype=bool)
        train_mask[:n_train] = True
        test_mask = ~train_mask

    train_ds = ParticipationDataset(X_valid[train_mask], y_f_valid[train_mask], y_s_valid[train_mask])
    val_ds = ParticipationDataset(X_valid[test_mask], y_f_valid[test_mask], y_s_valid[test_mask])

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    # Calculate class weighting
    n_pos = np.sum(y_f_valid[train_mask] == 1)
    n_neg = np.sum(y_f_valid[train_mask] == 0)
    pos_weight = float(n_neg / max(1, n_pos))

    model = TemporalForecaster(interaction_dim=8, visual_dim=3, num_classes=3, conv_channels=32)

    trained_model, best_metrics = train_model(
        model,
        train_loader,
        val_loader,
        pos_weight=pos_weight,
        epochs=args.epochs,
        lr=args.lr
    )

    os.makedirs(args.output_dir, exist_ok=True)
    torch.save(trained_model.state_dict(), os.path.join(args.output_dir, "model.pt"))

    config = {
        'model_name': 'Component3_TemporalForecaster',
        'interaction_dim': 8,
        'visual_dim': 3,
        'conv_channels': 32,
        'history_seconds': 30,
        'forecast_seconds': 20,
        'best_checkpoint_metrics': best_metrics
    }

    with open(os.path.join(args.output_dir, "config.json"), 'w') as f:
        json.dump(config, f, indent=2)

    with open(os.path.join(args.output_dir, "metrics.json"), 'w') as f:
        json.dump(best_metrics, f, indent=2)

    # Save full inference probabilities for event evaluation
    trained_model.eval()
    all_ds = ParticipationDataset(X_valid, y_f_valid, y_s_valid)
    all_loader = DataLoader(all_ds, batch_size=args.batch_size, shuffle=False)
    all_probs = []
    with torch.no_grad():
        for x_b, _, _ in all_loader:
            out_f, _ = trained_model(x_b)
            probs = torch.sigmoid(out_f).cpu().numpy().flatten()
            all_probs.extend(probs)

    np.save(os.path.join(args.output_dir, "predictions.npy"), np.array(all_probs, dtype=np.float32))
    manifest_valid.to_csv(os.path.join(args.output_dir, "eval_manifest.csv"), index=False)

    print("\n================ TCN FORECASTER RESULTS ================")
    print(f"Validation PR-AUC: {best_metrics.get('val_pr_auc', 0):.4f}")
    print(f"Validation ROC-AUC: {best_metrics.get('val_roc_auc', 0):.4f}")
    print(f"Validation F1-Score: {best_metrics.get('f1_score', 0):.4f}")
    print(f"Saved checkpoint, predictions, and configuration to {args.output_dir}\n")


if __name__ == "__main__":
    main()
