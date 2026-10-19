"""
SCPA Bandit Policy and Ablation Policies.
Implements Masked Thompson Sampling with Frozen Neural Encoder and Bayesian Linear Action Heads.
"""
import copy
import json
import random
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.model import (
    ContextEncoderMLP,
    BayesianLinearHead,
    ACTION_MAP,
    extract_features
)

class SCPABanditPolicy:
    """
    Shared Context Personalised Activity (SCPA) Bandit Policy.
    - Encodes context with frozen ContextEncoderMLP (phi(s) in R^16).
    - Features: x = [1.0, phi(s)] in R^17.
    - 4 Bayesian linear heads with Gaussian conjugate priors.
    - Masked Thompson Sampling over strictly eligible actions.
    - Online recursive updates on executed action heads only.
    """
    def __init__(self, seed: int = 42, weights_path: Optional[Path] = None, norm_path: Optional[Path] = None):
        self.name = "SCPA_Full"
        self.seed = seed
        self.rng = random.Random(seed)

        # Load weights and preprocessing
        if weights_path is None:
            weights_path = ROOT / "models/model_weights.json"
        if norm_path is None:
            norm_path = ROOT / "models/preprocessing.json"

        with open(weights_path, "r") as f:
            weights = json.load(f)
        self.encoder = ContextEncoderMLP.from_dict(weights)

        with open(norm_path, "r") as f:
            norm = json.load(f)
        self.means = norm["means"]
        self.stds = norm["stds"]

        # Action heads: feature_dim = 1 (bias) + 16 (encoder latent) = 17
        self.heads = {action: BayesianLinearHead(feature_dim=17) for action in ACTION_MAP}

    def reset(self, new_seed: Optional[int] = None):
        if new_seed is not None:
            self.seed = new_seed
        self.rng = random.Random(self.seed)
        self.heads = {action: BayesianLinearHead(feature_dim=17) for action in ACTION_MAP}

    def _get_feature_vector(self, snapshot: Dict[str, Any]) -> List[float]:
        dec_time = snapshot.get("decision_time", "")
        raw_feats = extract_features(snapshot, dec_time)
        norm_feats = [(f - m) / s for f, m, s in zip(raw_feats, self.means, self.stds)]
        phi = self.encoder.encode(norm_feats)
        return [1.0] + phi

    def select_action(self, snapshot: Dict[str, Any], eligible_actions: List[str]) -> Optional[str]:
        if not eligible_actions:
            return None

        x = self._get_feature_vector(snapshot)

        best_action = None
        best_score = float("-inf")

        for action in eligible_actions:
            head = self.heads[action]
            sample_w = head.sample_weights(self.rng)
            score = sum(w * val for w, val in zip(sample_w, x))
            # Tie breaking with small random noise
            score += self.rng.uniform(-1e-6, 1e-6)

            if score > best_score:
                best_score = score
                best_action = action

        return best_action

    def update(self, snapshot: Dict[str, Any], action_id: str, reward: float):
        if action_id in self.heads:
            x = self._get_feature_vector(snapshot)
            self.heads[action_id].update(x, reward)


class SCPANoConfidenceWeightPolicy(SCPABanditPolicy):
    """Ablation: Uses raw C3 risk without confidence scaling."""
    def __init__(self, seed: int = 42):
        super().__init__(seed=seed)
        self.name = "SCPA_NoConfidenceWeight"

    def _get_feature_vector(self, snapshot: Dict[str, Any]) -> List[float]:
        # Unweighted ablation: replace confidence-weighted risk with raw risk
        snap_copy = copy.deepcopy(snapshot)
        risk = snap_copy.get("c3_risk")
        if risk and "confidence" in risk:
            risk["confidence"] = 1.0 # Force weight to 1.0
        return super()._get_feature_vector(snap_copy)


class SCPANoSharedSignalsPolicy(SCPABanditPolicy):
    """Ablation: Zeroes out C1 (help requests) and C3 (frustration risk)."""
    def __init__(self, seed: int = 42):
        super().__init__(seed=seed)
        self.name = "SCPA_NoSharedSignals"

    def _get_feature_vector(self, snapshot: Dict[str, Any]) -> List[float]:
        snap_copy = copy.deepcopy(snapshot)
        snap_copy["c3_risk"] = None
        snap_copy["confirmed_requests"] = []
        return super()._get_feature_vector(snap_copy)


class LinearBanditPolicy:
    """Baseline: Standard Thompson sampling directly on raw 9 context features (dim = 10)."""
    def __init__(self, seed: int = 42, norm_path: Optional[Path] = None):
        self.name = "Linear_Bandit"
        self.seed = seed
        self.rng = random.Random(seed)
        if norm_path is None:
            norm_path = ROOT / "models/preprocessing.json"
        with open(norm_path, "r") as f:
            norm = json.load(f)
        self.means = norm["means"]
        self.stds = norm["stds"]
        # Feature dim = 1 (bias) + 9 (raw features) = 10
        self.heads = {action: BayesianLinearHead(feature_dim=10) for action in ACTION_MAP}

    def reset(self, new_seed: Optional[int] = None):
        if new_seed is not None:
            self.seed = new_seed
        self.rng = random.Random(self.seed)
        self.heads = {action: BayesianLinearHead(feature_dim=10) for action in ACTION_MAP}

    def _get_feature_vector(self, snapshot: Dict[str, Any]) -> List[float]:
        dec_time = snapshot.get("decision_time", "")
        raw_feats = extract_features(snapshot, dec_time)
        norm_feats = [(f - m) / s for f, m, s in zip(raw_feats, self.means, self.stds)]
        return [1.0] + norm_feats

    def select_action(self, snapshot: Dict[str, Any], eligible_actions: List[str]) -> Optional[str]:
        if not eligible_actions:
            return None
        x = self._get_feature_vector(snapshot)
        best_action = None
        best_score = float("-inf")
        for action in eligible_actions:
            sample_w = self.heads[action].sample_weights(self.rng)
            score = sum(w * val for w, val in zip(sample_w, x)) + self.rng.uniform(-1e-6, 1e-6)
            if score > best_score:
                best_score = score
                best_action = action
        return best_action

    def update(self, snapshot: Dict[str, Any], action_id: str, reward: float):
        if action_id in self.heads:
            x = self._get_feature_vector(snapshot)
            self.heads[action_id].update(x, reward)
