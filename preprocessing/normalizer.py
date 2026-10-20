"""
Preprocessing and normalization module for PUSG-Fusion (Component 1).

Mathematical specification:
1. Spatial coordinate convention:
   - Hand landmark coordinates (x, y, z) from MediaPipe Hand Landmarker:
     x: normalized horizontal position [0, 1]
     y: normalized vertical position [0, 1]
     z: estimated relative depth relative to wrist (landmark 0)
2. Wrist-centric origin:
   - For hand h in {0, 1} at time t:
     If valid_mask[t, h] == 1:
       origin = landmarks[t, h, 0, :]  # wrist
       centered[t, h, i, :] = landmarks[t, h, i, :] - origin
3. Scale normalization:
   - Palm distance d = ||landmarks[t, h, 9, :] - landmarks[t, h, 0, :]||_2 (wrist to middle MCP)
   - scale = d if d > 1e-4 else 1.0
   - normalized[t, h, i, :] = centered[t, h, i, :] / scale
4. Missing hand representation:
   - If valid_mask[t, h] == 0:
     normalized[t, h, :, :] = 0.0
5. Output feature vector per frame t:
   - Concatenation of normalized landmarks for hand 0 (63 dims), hand 1 (63 dims),
     and validity masks (2 dims) -> 128 feature dimensions per time step.
   - Sequence shape: [T=32, D=128].
"""

import numpy as np
from typing import Tuple, Optional


class GestureNormalizer:
    def __init__(self, target_timesteps: int = 32):
        self.target_timesteps = target_timesteps
        self.num_hands = 2
        self.num_landmarks = 21
        self.coords_per_landmark = 3
        self.feature_dim = self.num_hands * self.num_landmarks * self.coords_per_landmark + self.num_hands  # 128

    def resample_temporal(
        self, 
        landmarks: np.ndarray, 
        masks: np.ndarray, 
        timestamps: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Resamples a variable-length recording sequence to self.target_timesteps (32)
        using linear interpolation across normalized time [0, 1].
        
        Args:
            landmarks: array of shape [N, 2, 21, 3]
            masks: array of shape [N, 2]
            timestamps: array of shape [N] (monotonic in milliseconds)
        """
        n_frames = len(landmarks)
        if n_frames == self.target_timesteps:
            return landmarks.copy(), masks.copy()

        if n_frames < 2:
            # Repeat single frame
            resampled_lm = np.repeat(landmarks, self.target_timesteps, axis=0)
            resampled_mk = np.repeat(masks, self.target_timesteps, axis=0)
            return resampled_lm, resampled_mk

        # Normalize time to [0, 1]
        t_orig = np.linspace(0.0, 1.0, num=n_frames)
        t_target = np.linspace(0.0, 1.0, num=self.target_timesteps)

        resampled_lm = np.zeros((self.target_timesteps, self.num_hands, self.num_landmarks, self.coords_per_landmark), dtype=np.float32)
        resampled_mk = np.zeros((self.target_timesteps, self.num_hands), dtype=np.float32)

        # Interpolate coordinates
        flat_lm = landmarks.reshape(n_frames, -1)  # [N, 126]
        resampled_flat = np.zeros((self.target_timesteps, flat_lm.shape[1]), dtype=np.float32)
        for d in range(flat_lm.shape[1]):
            resampled_flat[:, d] = np.interp(t_target, t_orig, flat_lm[:, d])
        resampled_lm = resampled_flat.reshape(self.target_timesteps, self.num_hands, self.num_landmarks, self.coords_per_landmark)

        # Nearest neighbor interpolation for binary masks
        for h in range(self.num_hands):
            resampled_mk[:, h] = np.round(np.interp(t_target, t_orig, masks[:, h]))

        return resampled_lm, resampled_mk

    def normalize_spatial(self, landmarks: np.ndarray, masks: np.ndarray) -> np.ndarray:
        """
        Applies wrist centering, palm-scale normalization, trajectory encoding, and mask preservation.
        - Landmark 0 encodes the wrist trajectory relative to the start of the sequence: (w_t - w_0) / scale
        - Landmarks 1..20 encode the finger articulation relative to current wrist: (p_t - w_t) / scale
        
        Args:
            landmarks: array of shape [T, 2, 21, 3]
            masks: array of shape [T, 2]
            
        Returns:
            feature_tensor: array of shape [T, 128]
        """
        t_steps = landmarks.shape[0]
        norm_lm = np.zeros_like(landmarks, dtype=np.float32)

        for h in range(self.num_hands):
            # Find the initial valid wrist position for this hand
            initial_wrist = None
            palm_scale = 1.0
            for t in range(t_steps):
                if masks[t, h] > 0.5:
                    initial_wrist = landmarks[t, h, 0, :].copy()
                    middle_mcp = landmarks[t, h, 9, :] - initial_wrist
                    scale_val = np.linalg.norm(middle_mcp)
                    if scale_val > 1e-4:
                        palm_scale = float(scale_val)
                    break

            if initial_wrist is None:
                continue

            for t in range(t_steps):
                if masks[t, h] > 0.5:
                    current_wrist = landmarks[t, h, 0, :].copy()
                    # Landmark 0: wrist motion trajectory from initial position
                    norm_lm[t, h, 0, :] = (current_wrist - initial_wrist) / palm_scale

                    # Landmarks 1..20: hand shape articulation relative to current wrist
                    for i in range(1, self.num_landmarks):
                        norm_lm[t, h, i, :] = (landmarks[t, h, i, :] - current_wrist) / palm_scale
                else:
                    norm_lm[t, h, :, :] = 0.0

        # Flatten landmarks: [T, 2 * 21 * 3 = 126]
        flat_coords = norm_lm.reshape(t_steps, -1)
        # Concatenate tracking masks: [T, 126 + 2 = 128]
        feature_tensor = np.concatenate([flat_coords, masks.astype(np.float32)], axis=-1)
        return feature_tensor.astype(np.float32)

    def process_sequence(
        self, 
        raw_landmarks: np.ndarray, 
        raw_masks: np.ndarray, 
        raw_timestamps: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """Full pipeline: resample to 32 steps -> wrist center & scale -> 128-dim features."""
        if raw_timestamps is None:
            raw_timestamps = np.linspace(0, 2000, len(raw_landmarks))
        res_lm, res_mk = self.resample_temporal(raw_landmarks, raw_masks, raw_timestamps)
        return self.normalize_spatial(res_lm, res_mk)
