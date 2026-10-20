"""
Model architectures for Component 1 (PUSG-Fusion):
1. SummaryFeatureBaseline: Classical MLP on statistical sequence summary features.
2. TemporalCNNBaseline: 1D-CNN temporal baseline.
3. PUSGFusionModel: Proposed research architecture combining temporal gesture encoder,
   personal prototype memory, context/symbol embeddings, learned fusion gate,
   and validation-calibrated clarification rejection.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Optional, Tuple, List, Any


INTENT_LABELS = ["Help", "Break", "Finished", "Yes", "No"]
NUM_CLASSES = len(INTENT_LABELS)


class SummaryFeatureBaseline(nn.Module):
    """
    Baseline 1: Sequence summary feature classifier.
    Computes mean, std, min, max, and velocity over 32 time steps.
    Input: [B, 32, 128] -> Summary: [B, 128 * 5 = 640] -> MLP -> [B, 5].
    """
    def __init__(self, input_dim: int = 128, num_classes: int = NUM_CLASSES, hidden_dim: int = 128):
        super().__init__()
        summary_dim = input_dim * 5
        self.classifier = nn.Sequential(
            nn.Linear(summary_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.BatchNorm1d(hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, num_classes)
        )

    def extract_summary(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, T=32, D=128]
        mean_feat = torch.mean(x, dim=1)
        std_feat = torch.std(x, dim=1)
        min_feat = torch.amin(x, dim=1)
        max_feat = torch.amax(x, dim=1)
        velocity = torch.mean(torch.diff(x, dim=1), dim=1)
        return torch.cat([mean_feat, std_feat, min_feat, max_feat, velocity], dim=-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        summary = self.extract_summary(x)
        return self.classifier(summary)


class TemporalCNNBaseline(nn.Module):
    """
    Baseline 2: 1D Temporal Convolutional Neural Network.
    Input: [B, 32, 128] -> transpose to [B, 128, 32] -> Conv1D blocks -> [B, 5].
    """
    def __init__(self, input_dim: int = 128, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.conv1 = nn.Conv1d(input_dim, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(64)
        self.conv2 = nn.Conv1d(64, 128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(128)
        self.pool = nn.MaxPool1d(2)
        self.conv3 = nn.Conv1d(128, 64, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(64)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.fc = nn.Linear(64, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, T=32, D=128] -> [B, D=128, T=32]
        x = x.transpose(1, 2)
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.pool(F.relu(self.bn2(self.conv2(x))))
        x = F.relu(self.bn3(self.conv3(x)))
        x = self.global_pool(x).squeeze(-1)
        return self.fc(x)


class TemporalGestureEncoder(nn.Module):
    """
    Temporal gesture encoder with 1D convolutions + BiGRU + Temporal Attention.
    Outputs a normalized d-dimensional embedding vector z_g in R^64.
    """
    def __init__(self, input_dim: int = 128, embed_dim: int = 64):
        super().__init__()
        self.conv_stem = nn.Sequential(
            nn.Conv1d(input_dim, 64, kernel_size=3, padding=1),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.2)
        )
        self.gru = nn.GRU(
            input_size=64, 
            hidden_size=64, 
            num_layers=1, 
            batch_first=True, 
            bidirectional=True
        )
        # Attention pooling: from BiGRU output (128 dims) -> score
        self.attention = nn.Sequential(
            nn.Linear(128, 32),
            nn.Tanh(),
            nn.Linear(32, 1)
        )
        self.proj = nn.Linear(128, embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, T=32, D=128]
        stem_in = x.transpose(1, 2)
        stem_out = self.conv_stem(stem_in).transpose(1, 2)  # [B, 32, 64]
        gru_out, _ = self.gru(stem_out)  # [B, 32, 128]

        # Attention weights across time
        attn_weights = F.softmax(self.attention(gru_out), dim=1)  # [B, 32, 1]
        pooled = torch.sum(gru_out * attn_weights, dim=1)  # [B, 128]
        embedding = self.proj(pooled)  # [B, 64]
        return F.normalize(embedding, p=2, dim=-1)


class PUSGFusionModel(nn.Module):
    """
    Proposed Research Architecture (PUSG-Fusion):
    1. TemporalGestureEncoder: maps 32x128 gesture sequence to z_g in R^64.
    2. Symbol & Context Embedding:
       - Symbol index (0=None, 1=Help, 2=Break, 3=Finished, 4=Yes, 5=No) -> 32 dims.
       - Context state (current_count, target_count) -> 16 dims.
    3. Personal Prototype Similarity:
       - Distance/similarity to personal enrolled prototypes for the 5 intents -> 5 dims.
    4. Learned Fusion Gate:
       - Fuses gesture, prototype similarities, symbol, context, and modality masks.
    5. Calibrated Clarification & Rejection Mechanism:
       - Confidence & margin thresholding for safe interaction.
    """
    def __init__(
        self,
        input_dim: int = 128,
        gesture_embed_dim: int = 64,
        symbol_embed_dim: int = 32,
        context_embed_dim: int = 16,
        num_classes: int = NUM_CLASSES,
        confidence_threshold: float = 0.70,
        margin_threshold: float = 0.15,
    ):
        super().__init__()
        self.num_classes = num_classes
        self.confidence_threshold = confidence_threshold
        self.margin_threshold = margin_threshold

        self.gesture_encoder = TemporalGestureEncoder(input_dim, gesture_embed_dim)
        
        # Symbol embedding: index 0 = absent/none, 1..5 = Help..No
        self.symbol_embed = nn.Embedding(num_classes + 1, symbol_embed_dim)

        # Context embedding: [current_ratio, is_completed]
        self.context_encoder = nn.Sequential(
            nn.Linear(2, context_embed_dim),
            nn.ReLU()
        )

        # Fusion input dim:
        # z_g (64) + z_s (32) + z_c (16) + proto_sim (5) + mod_masks (2) = 119
        fusion_in_dim = gesture_embed_dim + symbol_embed_dim + context_embed_dim + num_classes + 2
        self.fusion_gate = nn.Sequential(
            nn.Linear(fusion_in_dim, 96),
            nn.BatchNorm1d(96),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(96, 48),
            nn.ReLU(),
            nn.Linear(48, num_classes)
        )

        # Personal prototype bank: [num_classes, gesture_embed_dim] initialized to zeros
        self.register_buffer("personal_prototypes", torch.zeros(num_classes, gesture_embed_dim))
        self.register_buffer("has_prototypes", torch.zeros(num_classes, dtype=torch.bool))

    def update_personal_prototypes(self, intent_idx: int, prototype_vector: torch.Tensor):
        """Updates personal prototype memory with confirmed enrolment vector."""
        norm_proto = F.normalize(prototype_vector.detach(), p=2, dim=-1)
        self.personal_prototypes[intent_idx] = norm_proto
        self.has_prototypes[intent_idx] = True

    def forward_encoder_only(self, gesture_sequence: torch.Tensor) -> torch.Tensor:
        """Helper for ONNX export: returns the 64-dim gesture embedding."""
        return self.gesture_encoder(gesture_sequence)

    def forward(
        self,
        gesture_sequence: torch.Tensor,
        symbol_idx: Optional[torch.Tensor] = None,
        context_state: Optional[torch.Tensor] = None,
        gesture_mask: Optional[torch.Tensor] = None,
        symbol_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Forward pass returning fused classification logits [B, 5].
        """
        batch_size = gesture_sequence.size(0)
        device = gesture_sequence.device

        # 1. Gesture embedding
        z_g = self.gesture_encoder(gesture_sequence)  # [B, 64]

        # 2. Modality presence flags
        if gesture_mask is None:
            gesture_mask = torch.ones(batch_size, 1, device=device)
        if symbol_mask is None:
            symbol_mask = torch.zeros(batch_size, 1, device=device) if symbol_idx is None else (symbol_idx > 0).float().unsqueeze(-1)

        # 3. Symbol embedding
        if symbol_idx is None:
            symbol_idx = torch.zeros(batch_size, dtype=torch.long, device=device)
        z_s = self.symbol_embed(symbol_idx)  # [B, 32]

        # 4. Context state [ratio, is_completed]
        if context_state is None:
            context_state = torch.zeros(batch_size, 2, device=device)
        z_c = self.context_encoder(context_state)  # [B, 16]

        # 5. Personal prototype similarity: cosine similarity to prototype vectors [B, 5]
        # personal_prototypes: [5, 64] -> z_g: [B, 64]
        proto_sim = torch.matmul(z_g, self.personal_prototypes.t())  # [B, 5]

        # 6. Multimodal fusion
        fused_in = torch.cat([z_g, z_s, z_c, proto_sim, gesture_mask, symbol_mask], dim=-1)
        logits = self.fusion_gate(fused_in)
        return logits

    def predict_with_clarification(
        self,
        gesture_sequence: torch.Tensor,
        symbol_idx: Optional[torch.Tensor] = None,
        context_state: Optional[torch.Tensor] = None,
    ) -> Dict[str, Any]:
        """
        Inference routine with validation-calibrated rejection and symbol priority.
        """
        self.eval()
        with torch.no_grad():
            batch_size = gesture_sequence.size(0)
            logits = self.forward(gesture_sequence, symbol_idx, context_state)
            probs = F.softmax(logits, dim=-1)

            # Check if direct symbol selection is present (Priority 1.0)
            if symbol_idx is not None and symbol_idx[0].item() > 0:
                selected_intent_idx = symbol_idx[0].item() - 1
                return {
                    "intent_probabilities": probs[0].cpu().tolist(),
                    "candidate_intent": INTENT_LABELS[selected_intent_idx],
                    "confidence": 1.0,
                    "confirmation_status": "confirmed_symbol",
                    "clarification_flag": False,
                    "reason": "Direct picture symbol selection (100% priority)",
                    "model_version": "1.0.0",
                }

            top_probs, top_indices = torch.topk(probs, k=2, dim=-1)
            p1 = top_probs[0, 0].item()
            p2 = top_probs[0, 1].item()
            margin = p1 - p2
            pred_intent = INTENT_LABELS[top_indices[0, 0].item()]

            # Calibrated clarification condition:
            requires_clarification = (p1 < self.confidence_threshold) or (margin < self.margin_threshold)

            return {
                "intent_probabilities": probs[0].cpu().tolist(),
                "candidate_intent": pred_intent,
                "confidence": float(round(p1, 4)),
                "confirmation_status": "inferred_gesture" if not requires_clarification else "pending_clarification",
                "clarification_flag": bool(requires_clarification),
                "margin": float(round(margin, 4)),
                "reason": "Low confidence or ambiguous margin" if requires_clarification else "High confidence prediction",
                "model_version": "1.0.0",
            }
