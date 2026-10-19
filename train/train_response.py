"""
Train the Context-only Neural Response Encoder and Logistic Baseline.
Applies Binary Cross-Entropy (BCE) to logged action success outcomes.
Fits normalisation strictly on training data; saves weights and metadata.
"""
import copy
import json
import math
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.model import ContextEncoderMLP, ACTION_MAP, extract_features

def sigmoid(x: float) -> float:
    if x < -25:
        return 0.0
    if x > 25:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))

def load_dataset(json_path: Path):
    with open(json_path, "r") as f:
        data = json.load(f)
    samples = []
    for item in data:
        if item.get("status") == "completed" and "decision_event" in item and "outcome_event" in item:
            dec = item["decision_event"]
            out = item["outcome_event"]
            action = out["selected_action"]
            if action in ACTION_MAP:
                snapshot = dec["context_before_action"]
                dec_time = dec["decision_time"]
                feats = extract_features(snapshot, dec_time)
                label = 1.0 if out["outcome"] else 0.0
                samples.append({
                    "features": feats,
                    "action_idx": ACTION_MAP[action],
                    "label": label,
                    "reward": item["reward"]
                })
    return samples

def compute_normalizer(samples: List[Dict[str, Any]]) -> Tuple[List[float], List[float]]:
    n = len(samples)
    d = len(samples[0]["features"])
    means = [0.0] * d
    for s in samples:
        for i in range(d):
            means[i] += s["features"][i]
    means = [m / n for m in means]

    stds = [0.0] * d
    for s in samples:
        for i in range(d):
            diff = s["features"][i] - means[i]
            stds[i] += diff * diff
    stds = [math.sqrt(v / n) if v > 1e-8 else 1.0 for v in stds]
    return means, stds

def normalize_features(features: List[float], means: List[float], stds: List[float]) -> List[float]:
    return [(f - m) / s for f, m, s in zip(features, means, stds)]

def bce_loss(p: float, y: float) -> float:
    eps = 1e-12
    p = max(eps, min(1.0 - eps, p))
    return -(y * math.log(p) + (1.0 - y) * math.log(1.0 - p))

def evaluate_model(model: ContextEncoderMLP, samples: List[Dict[str, Any]], means: List[float], stds: List[float]):
    total_loss = 0.0
    correct = 0
    brier = 0.0
    bins = [[] for _ in range(10)]

    for s in samples:
        x = normalize_features(s["features"], means, stds)
        _, logits = model.forward(x)
        a_idx = s["action_idx"]
        prob = sigmoid(logits[a_idx])
        y = s["label"]

        total_loss += bce_loss(prob, y)
        pred_label = 1.0 if prob >= 0.50 else 0.0
        if pred_label == y:
            correct += 1
        brier += (prob - y) ** 2

        # Calibration bin
        b_idx = min(9, int(prob * 10))
        bins[b_idx].append((prob, y))

    n = len(samples)
    avg_loss = total_loss / n
    acc = correct / n
    avg_brier = brier / n

    # Expected Calibration Error (ECE)
    ece = 0.0
    for b in bins:
        if b:
            avg_prob = sum(p for p, _ in b) / len(b)
            avg_actual = sum(y for _, y in b) / len(b)
            ece += (len(b) / n) * abs(avg_prob - avg_actual)

    return {
        "bce_loss": round(avg_loss, 4),
        "accuracy": round(acc, 4),
        "brier_score": round(avg_brier, 4),
        "ece": round(ece, 4)
    }

def main():
    print("Training Context-only Neural Response Encoder...")
    raw_dir = ROOT / "data/raw"
    models_dir = ROOT / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    train_samples = load_dataset(raw_dir / "train_episodes.json")
    val_samples = load_dataset(raw_dir / "val_episodes.json")
    print(f"  Loaded {len(train_samples)} training samples and {len(val_samples)} validation samples.")

    # 1. Fit Normalizer Strictly on Training Set
    means, stds = compute_normalizer(train_samples)
    norm_config = {"means": means, "stds": stds}
    with open(models_dir / "preprocessing.json", "w") as f:
        json.dump(norm_config, f, indent=2)
    print("  Saved feature normalization -> models/preprocessing.json")

    # 2. Initialize Model & Optimizer
    model = ContextEncoderMLP(in_dim=9, h1_dim=32, h2_dim=16, out_dim=4, seed=42)
    lr = 0.005
    epochs = 35
    batch_size = 32
    best_val_loss = float("inf")
    best_weights = None
    patience = 5
    patience_counter = 0

    rng = random.Random(42)

    for epoch in range(epochs):
        rng.shuffle(train_samples)
        for i in range(0, len(train_samples), batch_size):
            batch = train_samples[i:i + batch_size]

            # Accumulate gradients
            dW1 = [[0.0] * model.h1_dim for _ in range(model.in_dim)]
            db1 = [0.0] * model.h1_dim
            dW2 = [[0.0] * model.h2_dim for _ in range(model.h1_dim)]
            db2 = [0.0] * model.h2_dim
            dW3 = [[0.0] * model.out_dim for _ in range(model.h2_dim)]
            db3 = [0.0] * model.out_dim

            for s in batch:
                x = normalize_features(s["features"], means, stds)
                a_idx = s["action_idx"]
                y = s["label"]

                # Forward pass
                # Layer 1
                z1 = [model.b1[j] + sum(x[k] * model.W1[k][j] for k in range(model.in_dim)) for j in range(model.h1_dim)]
                h1 = [max(0.0, v) for v in z1]
                # Layer 2
                z2 = [model.b2[j] + sum(h1[k] * model.W2[k][j] for k in range(model.h1_dim)) for j in range(model.h2_dim)]
                h2 = [max(0.0, v) for v in z2]
                # Output
                logits = [model.b3[j] + sum(h2[k] * model.W3[k][j] for k in range(model.h2_dim)) for j in range(model.out_dim)]
                prob = sigmoid(logits[a_idx])

                # Gradient of BCE w.r.t logits: (p - y)
                dlogit = prob - y
                for k in range(model.h2_dim):
                    dW3[k][a_idx] += dlogit * h2[k]
                db3[a_idx] += dlogit

                # Backprop to h2
                dh2 = [dlogit * model.W3[k][a_idx] for k in range(model.h2_dim)]
                dz2 = [dh2[k] if z2[k] > 0 else 0.0 for k in range(model.h2_dim)]
                for k in range(model.h1_dim):
                    for j in range(model.h2_dim):
                        dW2[k][j] += dz2[j] * h1[k]
                for j in range(model.h2_dim):
                    db2[j] += dz2[j]

                # Backprop to h1
                dh1 = [sum(dz2[j] * model.W2[k][j] for j in range(model.h2_dim)) for k in range(model.h1_dim)]
                dz1 = [dh1[k] if z1[k] > 0 else 0.0 for k in range(model.h1_dim)]
                for k in range(model.in_dim):
                    for j in range(model.h1_dim):
                        dW1[k][j] += dz1[j] * x[k]
                for j in range(model.h1_dim):
                    db1[j] += dz1[j]

            # Apply gradient step with L2 regularization
            bs = len(batch)
            reg = 0.0001
            for k in range(model.in_dim):
                for j in range(model.h1_dim):
                    model.W1[k][j] -= lr * (dW1[k][j] / bs + reg * model.W1[k][j])
            for j in range(model.h1_dim):
                model.b1[j] -= lr * (db1[j] / bs)

            for k in range(model.h1_dim):
                for j in range(model.h2_dim):
                    model.W2[k][j] -= lr * (dW2[k][j] / bs + reg * model.W2[k][j])
            for j in range(model.h2_dim):
                model.b2[j] -= lr * (db2[j] / bs)

            for k in range(model.h2_dim):
                for j in range(model.out_dim):
                    model.W3[k][j] -= lr * (dW3[k][j] / bs + reg * model.W3[k][j])
            for j in range(model.out_dim):
                model.b3[j] -= lr * (db3[j] / bs)

        # Validation check
        val_metrics = evaluate_model(model, val_samples, means, stds)
        val_loss = val_metrics["bce_loss"]

        if val_loss < best_val_loss - 0.0005:
            best_val_loss = val_loss
            best_weights = copy.deepcopy(model.to_dict())
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"  Early stopping triggered at epoch {epoch+1}.")
                break

    # Restore best checkpoint
    if best_weights:
        model = ContextEncoderMLP.from_dict(best_weights)

    final_train_metrics = evaluate_model(model, train_samples, means, stds)
    final_val_metrics = evaluate_model(model, val_samples, means, stds)

    print(f"  Final Train Metrics: BCE={final_train_metrics['bce_loss']}, Acc={final_train_metrics['accuracy']}, ECE={final_train_metrics['ece']}")
    print(f"  Final Val Metrics:   BCE={final_val_metrics['bce_loss']}, Acc={final_val_metrics['accuracy']}, ECE={final_val_metrics['ece']}")

    # Save Model Weights
    with open(models_dir / "model_weights.json", "w") as f:
        json.dump(model.to_dict(), f, indent=2)
    print("  Saved model weights -> models/model_weights.json")

    # Save Labels
    labels_meta = {
        "actions": ACTION_MAP,
        "input_features": [
            "skill_estimate", "recent_success_rate", "recent_independent_rate",
            "hint_frequency", "c3_risk_value", "c3_confidence", "c3_is_known",
            "c3_is_missing", "consecutive_failures"
        ],
        "reward_formula": "clip(0.7*success + 0.3*independent - 0.05*min(hints,4) - 0.30*distress, -1.0, 1.0)"
    }
    with open(models_dir / "labels.json", "w") as f:
        json.dump(labels_meta, f, indent=2)

    # Save training report
    summary = {
        "status": "trained_frozen",
        "train_samples": len(train_samples),
        "val_samples": len(val_samples),
        "train_metrics": final_train_metrics,
        "val_metrics": final_val_metrics,
        "architecture": "ContextEncoderMLP (9 -> 32 -> 16 -> 4 logits)"
    }
    with open(models_dir / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print("Training complete.\n")

if __name__ == "__main__":
    main()
