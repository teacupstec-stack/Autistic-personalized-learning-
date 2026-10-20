"""
Training and evaluation pipeline for Component 1 (PUSG-Fusion).
Trains:
1. Baseline 1: SummaryFeatureBaseline
2. Baseline 2: TemporalCNNBaseline
3. Proposed Research Model: PUSGFusionModel (with personal prototypes & fusion)
"""

import os
import sys
import json
import time
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import classification_report, confusion_matrix, f1_score

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from training.models import (
    SummaryFeatureBaseline, 
    TemporalCNNBaseline, 
    PUSGFusionModel, 
    INTENT_LABELS, 
    NUM_CLASSES
)

INTENT_TO_IDX = {intent: i for i, intent in enumerate(INTENT_LABELS)}


class GestureDataset(Dataset):
    def __init__(self, samples: list):
        self.samples = samples

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        s = self.samples[idx]
        features = torch.tensor(s["features"], dtype=torch.float32)  # [32, 128]
        label = INTENT_TO_IDX[s["confirmed_intent"]]
        # Context features: [count_ratio, is_completed]
        ctx = s.get("context_state", {})
        curr_cnt = ctx.get("current_count", 0)
        target_cnt = max(1, ctx.get("target_count", 5))
        ctx_tensor = torch.tensor([curr_cnt / target_cnt, 1.0 if curr_cnt >= target_cnt else 0.0], dtype=torch.float32)
        # Symbol index (0 if missing/unselected)
        sym_idx = 0
        if "selected_symbol_ids" in s and s["selected_symbol_ids"]:
            sym_intent = s["confirmed_intent"]
            sym_idx = INTENT_TO_IDX.get(sym_intent, 0) + 1
        return features, label, ctx_tensor, sym_idx, s["participant_id"]


def load_dataset_and_splits(data_path: str, manifest_path: str):
    with open(data_path, "r") as f:
        all_samples = json.load(f)
    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    sample_dict = {s["sample_id"]: s for s in all_samples}

    enrolment_samples = [sample_dict[sid] for sid in manifest["splits"]["enrolment"]]
    train_samples = [sample_dict[sid] for sid in manifest["splits"]["train"]]
    val_samples = [sample_dict[sid] for sid in manifest["splits"]["val"]]
    test_samples = [sample_dict[sid] for sid in manifest["splits"]["test"]]

    return enrolment_samples, train_samples, val_samples, test_samples


def build_personal_prototypes(model: PUSGFusionModel, enrolment_samples: list, device: torch.device):
    """
    Computes personal prototype memory vectors from confirmed enrolment samples.
    Prototypes are normalized average embeddings per intent class.
    """
    model.eval()
    intent_embeddings = {i: [] for i in range(NUM_CLASSES)}

    with torch.no_grad():
        for s in enrolment_samples:
            feat = torch.tensor(s["features"], dtype=torch.float32).unsqueeze(0).to(device)
            z_g = model.forward_encoder_only(feat)  # [1, 64]
            intent_idx = INTENT_TO_IDX[s["confirmed_intent"]]
            intent_embeddings[intent_idx].append(z_g.squeeze(0))

        for intent_idx in range(NUM_CLASSES):
            if len(intent_embeddings[intent_idx]) > 0:
                stacked = torch.stack(intent_embeddings[intent_idx], dim=0)  # [N_enr, 64]
                mean_proto = torch.mean(stacked, dim=0)
                model.update_personal_prototypes(intent_idx, mean_proto)

    print("Personal prototype memory initialized with confirmed enrolment vectors.")


def evaluate_model(model: nn.Module, loader: DataLoader, device: torch.device, is_fusion: bool = False):
    model.eval()
    all_preds = []
    all_targets = []
    total_loss = 0.0
    criterion = nn.CrossEntropyLoss()

    start_time = time.time()
    num_samples = 0

    with torch.no_grad():
        for features, labels, ctx, sym_idx, pids in loader:
            features = features.to(device)
            labels = labels.to(device)
            ctx = ctx.to(device)
            sym_idx = sym_idx.to(device)

            if is_fusion:
                logits = model(features, sym_idx, ctx)
            else:
                logits = model(features)

            loss = criterion(logits, labels)
            total_loss += loss.item() * len(labels)

            preds = torch.argmax(logits, dim=-1)
            all_preds.extend(preds.cpu().tolist())
            all_targets.extend(labels.cpu().tolist())
            num_samples += len(labels)

    elapsed_ms = ((time.time() - start_time) / max(1, num_samples)) * 1000
    avg_loss = total_loss / max(1, num_samples)
    accuracy = np.mean(np.array(all_preds) == np.array(all_targets))
    macro_f1 = f1_score(all_targets, all_preds, average="macro", zero_division=0)
    conf_mat = confusion_matrix(all_targets, all_preds, labels=list(range(NUM_CLASSES)))

    return {
        "loss": float(round(avg_loss, 4)),
        "accuracy": float(round(accuracy, 4)),
        "macro_f1": float(round(macro_f1, 4)),
        "confusion_matrix": conf_mat.tolist(),
        "latency_ms_per_sample": float(round(elapsed_ms, 3)),
        "targets": all_targets,
        "predictions": all_preds,
    }


def train_pipeline(epochs: int = 25, batch_size: int = 16, lr: float = 1e-3):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")

    os.makedirs("models/checkpoints", exist_ok=True)
    os.makedirs("evaluation", exist_ok=True)

    enrolment_samples, train_samples, val_samples, test_samples = load_dataset_and_splits(
        "data/processed/d1_synthetic_dataset.json",
        "data/processed/split_manifest.json"
    )

    train_loader = DataLoader(GestureDataset(train_samples), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(GestureDataset(val_samples), batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(GestureDataset(test_samples), batch_size=batch_size, shuffle=False)

    results_summary = {}

    # -------------------------------------------------------------
    # 1. Train Baseline 1: SummaryFeatureBaseline
    # -------------------------------------------------------------
    print("\n--- Training Baseline 1: SummaryFeatureBaseline ---")
    b1_model = SummaryFeatureBaseline(input_dim=128, num_classes=NUM_CLASSES).to(device)
    b1_opt = optim.Adam(b1_model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(epochs):
        b1_model.train()
        for feats, labels, _, _, _ in train_loader:
            feats, labels = feats.to(device), labels.to(device)
            b1_opt.zero_grad()
            logits = b1_model(feats)
            loss = criterion(logits, labels)
            loss.backward()
            b1_opt.step()

    b1_val = evaluate_model(b1_model, val_loader, device, is_fusion=False)
    b1_test = evaluate_model(b1_model, test_loader, device, is_fusion=False)
    print(f"Baseline 1 Results: Test Acc={b1_test['accuracy']:.4f}, Macro-F1={b1_test['macro_f1']:.4f}, Latency={b1_test['latency_ms_per_sample']}ms")
    results_summary["baseline_summary"] = {"val": b1_val, "test": b1_test}

    # -------------------------------------------------------------
    # 2. Train Baseline 2: TemporalCNNBaseline
    # -------------------------------------------------------------
    print("\n--- Training Baseline 2: TemporalCNNBaseline ---")
    b2_model = TemporalCNNBaseline(input_dim=128, num_classes=NUM_CLASSES).to(device)
    b2_opt = optim.Adam(b2_model.parameters(), lr=lr, weight_decay=1e-4)

    for epoch in range(epochs):
        b2_model.train()
        for feats, labels, _, _, _ in train_loader:
            feats, labels = feats.to(device), labels.to(device)
            b2_opt.zero_grad()
            logits = b2_model(feats)
            loss = criterion(logits, labels)
            loss.backward()
            b2_opt.step()

    b2_val = evaluate_model(b2_model, val_loader, device, is_fusion=False)
    b2_test = evaluate_model(b2_model, test_loader, device, is_fusion=False)
    print(f"Baseline 2 Results: Test Acc={b2_test['accuracy']:.4f}, Macro-F1={b2_test['macro_f1']:.4f}, Latency={b2_test['latency_ms_per_sample']}ms")
    results_summary["baseline_temporal_cnn"] = {"val": b2_val, "test": b2_test}

    # -------------------------------------------------------------
    # 3. Train Proposed Research Architecture: PUSGFusionModel
    # -------------------------------------------------------------
    print("\n--- Training Proposed Research Model: PUSG-Fusion ---")
    fusion_model = PUSGFusionModel(
        input_dim=128,
        gesture_embed_dim=64,
        confidence_threshold=0.70,
        margin_threshold=0.15
    ).to(device)

    # Initial prototype creation from enrolment samples
    build_personal_prototypes(fusion_model, enrolment_samples, device)

    fusion_opt = optim.AdamW(fusion_model.parameters(), lr=2e-3, weight_decay=1e-3)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(fusion_opt, T_max=epochs)
    best_val_f1 = -1.0
    best_checkpoint_path = "models/checkpoints/pusg_fusion_best.pt"

    for epoch in range(epochs):
        fusion_model.train()
        train_loss = 0.0

        for feats, labels, ctx, sym_idx, _ in train_loader:
            feats, labels = feats.to(device), labels.to(device)
            ctx, sym_idx = ctx.to(device), sym_idx.to(device)

            fusion_opt.zero_grad()
            logits = fusion_model(feats, sym_idx, ctx)
            loss = criterion(logits, labels)
            loss.backward()
            fusion_opt.step()
            train_loss += loss.item() * len(labels)

        scheduler.step()
        epoch_loss = train_loss / len(train_samples)
        val_res = evaluate_model(fusion_model, val_loader, device, is_fusion=True)

        if (epoch + 1) % 10 == 0 or epoch == epochs - 1:
            print(f"Epoch {epoch+1:02d}/{epochs:02d}: Train Loss={epoch_loss:.4f}, Val Loss={val_res['loss']:.4f}, Val Acc={val_res['accuracy']:.4f}, Val F1={val_res['macro_f1']:.4f}")

        if val_res["macro_f1"] >= best_val_f1:
            best_val_f1 = val_res["macro_f1"]
            torch.save({
                "epoch": epoch + 1,
                "model_state_dict": fusion_model.state_dict(),
                "macro_f1": best_val_f1,
                "intents": INTENT_LABELS,
                "model_version": "1.0.0",
                "normalizer_config": {"target_timesteps": 32, "feature_dim": 128}
            }, best_checkpoint_path)

    # Load best checkpoint for test evaluation
    checkpoint = torch.save and torch.load(best_checkpoint_path, map_location=device)
    fusion_model.load_state_dict(checkpoint["model_state_dict"])
    # Re-verify prototypes
    build_personal_prototypes(fusion_model, enrolment_samples, device)

    fusion_val = evaluate_model(fusion_model, val_loader, device, is_fusion=True)
    fusion_test = evaluate_model(fusion_model, test_loader, device, is_fusion=True)

    print(f"PUSG-Fusion Results: Test Acc={fusion_test['accuracy']:.4f}, Macro-F1={fusion_test['macro_f1']:.4f}, Latency={fusion_test['latency_ms_per_sample']}ms")
    results_summary["pusg_fusion"] = {"val": fusion_val, "test": fusion_test}

    # Evaluate clarification behaviour on test set
    fusion_model.eval()
    clarification_count = 0
    with torch.no_grad():
        for feats, labels, ctx, sym_idx, _ in test_loader:
            feats = feats.to(device)
            for i in range(len(labels)):
                res = fusion_model.predict_with_clarification(feats[i:i+1])
                if res["clarification_flag"]:
                    clarification_count += 1

    clarification_rate = clarification_count / max(1, len(test_samples))
    results_summary["pusg_fusion"]["test"]["clarification_rate"] = float(round(clarification_rate, 4))
    print(f"PUSG-Fusion Test Clarification Rate: {clarification_rate * 100:.1f}%")

    # Save metrics summary
    summary_file = "evaluation/metrics_summary.json"
    with open(summary_file, "w") as f:
        json.dump(results_summary, f, indent=2)

    print(f"\nAll models trained and evaluated. Summary saved to {summary_file}")
    print(f"Saved best model checkpoint to {best_checkpoint_path}")
    return results_summary


if __name__ == "__main__":
    train_pipeline()
