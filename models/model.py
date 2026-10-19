"""
C2 Neural Response Encoder and Bayesian Linear Action Heads.
Implements the 32->16 ReLU Context Encoder and Gaussian Bayesian Heads.
Includes pure-Python matrix operations to guarantee zero external dependency failures.
"""
import math
import random
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

ACTION_MAP = {
    "easy_visual": 0,
    "easy_text": 1,
    "medium_visual": 2,
    "medium_text": 3
}
INV_ACTION_MAP = {v: k for k, v in ACTION_MAP.items()}

# --- Pure Python Vector and Matrix Math Helpers ---

def vec_dot(u: List[float], v: List[float]) -> float:
    return sum(a * b for a, b in zip(u, v))

def vec_add(u: List[float], v: List[float]) -> List[float]:
    return [a + b for a, b in zip(u, v)]

def mat_vec_mul(M: List[List[float]], v: List[float]) -> List[float]:
    return [vec_dot(row, v) for row in M]

def mat_add(A: List[List[float]], B: List[List[float]]) -> List[List[float]]:
    return [[a + b for a, b in zip(r1, r2)] for r1, r2 in zip(A, B)]

def outer_product(u: List[float], v: List[float]) -> List[List[float]]:
    return [[a * b for b in v] for a in u]

def invert_matrix(A: List[List[float]]) -> List[List[float]]:
    """Invert an n x n symmetric positive-definite matrix via Gauss-Jordan elimination."""
    n = len(A)
    # Augment matrix with identity
    aug = [row[:] + [1.0 if i == j else 0.0 for j in range(n)] for i, row in enumerate(A)]
    
    for i in range(n):
        # Pivot search
        pivot_row = i
        max_val = abs(aug[i][i])
        for k in range(i + 1, n):
            if abs(aug[k][i]) > max_val:
                max_val = abs(aug[k][i])
                pivot_row = k
        if pivot_row != i:
            aug[i], aug[pivot_row] = aug[pivot_row], aug[i]

        pivot = aug[i][i]
        if abs(pivot) < 1e-12:
            pivot = 1e-12 # regularize slightly
        inv_pivot = 1.0 / pivot
        aug[i] = [val * inv_pivot for val in aug[i]]

        for r in range(n):
            if r != i:
                factor = aug[r][i]
                if abs(factor) > 1e-15:
                    aug[r] = [aug[r][c] - factor * aug[i][c] for c in range(2 * n)]

    return [row[n:] for row in aug]

def cholesky(A: List[List[float]]) -> List[List[float]]:
    """Cholesky decomposition A = L L^T for covariance matrix."""
    n = len(A)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                val = A[i][i] - s
                L[i][j] = math.sqrt(max(1e-12, val))
            else:
                L[i][j] = (A[i][j] - s) / L[j][j]
    return L

def sample_multivariate_normal(mean: List[float], cov: List[List[float]], rng: random.Random) -> List[float]:
    """Sample from N(mean, cov) via Cholesky decomposition."""
    L = cholesky(cov)
    n = len(mean)
    z = [rng.gauss(0.0, 1.0) for _ in range(n)]
    sampled = mat_vec_mul(L, z)
    return vec_add(mean, sampled)


# --- Context Feature Preprocessing ---

def extract_features(snapshot: Dict[str, Any], decision_time_str: str) -> List[float]:
    """
    Extracts 9 normalized numerical features from context snapshot:
    1. skill_estimate
    2. recent_success_rate
    3. recent_independent_rate
    4. hint_frequency
    5. c3_risk_value (confidence-weighted)
    6. c3_confidence
    7. c3_is_known
    8. c3_is_missing
    9. consecutive_failures
    """
    skill = snapshot.get("skill_estimate")
    skill_val = 0.50 if skill is None else float(skill)

    recent = snapshot.get("recent_results", [])
    if recent:
        success_rate = sum(1.0 for r in recent if r.get("success")) / len(recent)
        indep_rate = sum(1.0 for r in recent if r.get("independent")) / len(recent)
        # consecutive failures from end
        streak = 0
        for r in reversed(recent):
            if not r.get("success"):
                streak += 1
            else:
                break
    else:
        success_rate = 0.50
        indep_rate = 0.50
        streak = 0

    hints = snapshot.get("hint_history", [])
    hint_freq = (sum(h.get("count", 0) for h in hints) / len(hints)) if hints else 0.0

    # Effective C3 checking
    risk_obj = snapshot.get("c3_risk")
    if risk_obj and risk_obj.get("expires_at", "") > decision_time_str:
        c3_val = float(risk_obj.get("value", 0.0))
        c3_conf = float(risk_obj.get("confidence", 1.0))
        c3_weighted_risk = c3_val * c3_conf
        c3_known = 1.0
        c3_missing = 0.0
    else:
        c3_val = 0.0
        c3_conf = 0.0
        c3_weighted_risk = 0.0
        c3_known = 0.0
        c3_missing = 1.0

    return [
        skill_val,
        success_rate,
        indep_rate,
        hint_freq,
        c3_weighted_risk,
        c3_conf,
        c3_known,
        c3_missing,
        float(streak)
    ]


class ContextEncoderMLP:
    """
    Context-only MLP response encoder.
    Architecture: Input (9) -> FC(32) -> ReLU -> FC(16) -> ReLU -> Latent Context phi(s) (16)
                  Head: FC(4) action logits for training on logged success.
    """
    def __init__(self, in_dim: int = 9, h1_dim: int = 32, h2_dim: int = 16, out_dim: int = 4, seed: int = 42):
        self.in_dim = in_dim
        self.h1_dim = h1_dim
        self.h2_dim = h2_dim
        self.out_dim = out_dim
        rng = random.Random(seed)

        # Xavier/He initialization
        def init_layer(din, dout):
            scale = math.sqrt(2.0 / din)
            W = [[rng.gauss(0.0, scale) for _ in range(dout)] for _ in range(din)]
            b = [0.0] * dout
            return W, b

        self.W1, self.b1 = init_layer(in_dim, h1_dim)
        self.W2, self.b2 = init_layer(h1_dim, h2_dim)
        self.W3, self.b3 = init_layer(h2_dim, out_dim)

    def forward(self, x: List[float]) -> Tuple[List[float], List[float]]:
        """
        Returns (latent_phi, action_logits).
        latent_phi is the 16-dimensional representation.
        """
        # Layer 1: 9 -> 32
        h1 = [0.0] * self.h1_dim
        for j in range(self.h1_dim):
            s = self.b1[j] + sum(x[i] * self.W1[i][j] for i in range(self.in_dim))
            h1[j] = max(0.0, s) # ReLU

        # Layer 2: 32 -> 16
        h2 = [0.0] * self.h2_dim
        for j in range(self.h2_dim):
            s = self.b2[j] + sum(h1[i] * self.W2[i][j] for i in range(self.h1_dim))
            h2[j] = max(0.0, s) # ReLU

        # Output Head: 16 -> 4 logits
        logits = [0.0] * self.out_dim
        for j in range(self.out_dim):
            logits[j] = self.b3[j] + sum(h2[i] * self.W3[i][j] for i in range(self.h2_dim))

        return h2, logits

    def encode(self, x: List[float]) -> List[float]:
        """Returns the frozen latent representation phi(s)."""
        h2, _ = self.forward(x)
        return h2

    def to_dict(self) -> Dict[str, Any]:
        return {
            "in_dim": self.in_dim,
            "h1_dim": self.h1_dim,
            "h2_dim": self.h2_dim,
            "out_dim": self.out_dim,
            "W1": self.W1, "b1": self.b1,
            "W2": self.W2, "b2": self.b2,
            "W3": self.W3, "b3": self.b3
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]):
        net = cls(data["in_dim"], data["h1_dim"], data["h2_dim"], data["out_dim"])
        net.W1, net.b1 = data["W1"], data["b1"]
        net.W2, net.b2 = data["W2"], data["b2"]
        net.W3, net.b3 = data["W3"], data["b3"]
        return net


class BayesianLinearHead:
    """
    Gaussian Bayesian linear regression head for a single action variant.
    Estimates bounded reward r ~ w^T x where x = [1, phi(s)] (dim = 17).
    Prior: w ~ N(m_0, S_0^-1) where S_0 = 10 * I, m_0 = 0.
    """
    def __init__(self, feature_dim: int = 17, prior_precision: float = 10.0, noise_variance: float = 1.0):
        self.dim = feature_dim
        self.sigma2 = noise_variance
        self.prior_prec = prior_precision
        # Prior mean m0 = 0
        self.m = [0.0] * self.dim
        # Prior precision S0 = 10 * I
        self.S = [[prior_precision if i == j else 0.0 for j in range(self.dim)] for i in range(self.dim)]
        self.sum_xy = [0.0] * self.dim
        self._cov = None # cache for inverted covariance matrix S^-1

    @property
    def covariance(self) -> List[List[float]]:
        if self._cov is None:
            self._cov = invert_matrix(self.S)
        return self._cov

    def update(self, x: List[float], reward: float):
        """Sequential online update with a new observation (x, reward)."""
        # S_new = S + (1 / sigma^2) * x * x^T
        inv_noise = 1.0 / self.sigma2
        xxT = outer_product(x, x)
        for i in range(self.dim):
            self.sum_xy[i] += inv_noise * x[i] * reward
            for j in range(self.dim):
                self.S[i][j] += inv_noise * xxT[i][j]

        # Invalidate covariance cache and recompute posterior mean m = S^-1 * sum_xy
        self._cov = invert_matrix(self.S)
        self.m = mat_vec_mul(self._cov, self.sum_xy)

    def sample_weights(self, rng: random.Random) -> List[float]:
        """Draw a weight sample w ~ N(m, S^-1) for Thompson sampling."""
        return sample_multivariate_normal(self.m, self.covariance, rng)

    def predict_mean(self, x: List[float]) -> float:
        """Point estimate reward prediction."""
        return vec_dot(self.m, x)
