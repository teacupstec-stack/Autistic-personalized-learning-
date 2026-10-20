import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandFrame = { time: number; coords: number[][][]; masks: number[] };
let tracker: Promise<HandLandmarker> | null = null;
export function getTracker() {
  tracker ??= FilesetResolver.forVisionTasks('/hand-tracking/wasm').then(files =>
    HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/hand-tracking/hand_landmarker_v1.task' },
      runningMode: 'VIDEO', numHands: 2,
    })).catch(error => { tracker = null; throw error; });
  return tracker;
}

export function captureFrame(tracker: HandLandmarker, video: HTMLVideoElement): HandFrame {
  const time = performance.now();
  const result = tracker.detectForVideo(video, time);
  const coords = Array.from({ length: 2 }, () => Array.from({ length: 21 }, () => [0, 0, 0]));
  const masks = [0, 0];
  result.landmarks.forEach((hand, i) => {
    const h = result.handedness[i]?.[0]?.categoryName === 'Left' ? 0 : 1;
    if (masks[h]) return;
    masks[h] = 1;
    coords[h] = hand.map(p => [p.x, p.y, p.z]);
  });
  return { time, coords, masks };
}

// Match Python normalization: initial palm scale, wrist trajectory, relative fingers.
export function normalizeFrames(frames: HandFrame[]): Float32Array {
  if (frames.length < 8 || frames.filter(f => f.masks.some(Boolean)).length / frames.length < 0.6)
    throw new Error('Hands were not tracked clearly. Keep your hands visible and try again.');
  const firstTime = frames[0].time;
  const duration = frames.at(-1)!.time - firstTime;
  if (duration < 500) throw new Error('Capture was too short. Please try again.');
  const sampled = Array.from({ length: 32 }, (_, t) => {
    const target = firstTime + duration * t / 31;
    let i = 0;
    while (i < frames.length - 2 && frames[i + 1].time < target) i++;
    const a = frames[i], b = frames[i + 1];
    const weight = (target - a.time) / (b.time - a.time || 1);
    const masks = a.masks.map((v, h) => Math.round(v * (1 - weight) + b.masks[h] * weight));
    const coords = a.coords.map((hand, h) => hand.map((p, j) =>
      p.map((v, k) => v * (1 - weight) + b.coords[h][j][k] * weight)));
    return { masks, coords };
  });
  const output = new Float32Array(32 * 128);
  for (let h = 0; h < 2; h++) {
    const first = sampled.find(f => f.masks[h]);
    if (!first) continue;
    const origin = first.coords[h][0];
    const scale = Math.hypot(...first.coords[h][9].map((v, k) => v - origin[k]));
    if (scale < 1e-4) throw new Error('Hand tracking scale is invalid. Please try again.');
    sampled.forEach((f, t) => {
      output[t * 128 + 126 + h] = f.masks[h];
      if (!f.masks[h]) return;
      f.coords[h].forEach((point, j) => point.forEach((v, k) => {
        output[t * 128 + h * 63 + j * 3 + k] =
          (v - (j === 0 ? origin[k] : f.coords[h][0][k])) / scale;
      }));
    });
  }
  return output;
}
