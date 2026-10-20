/**
 * eventFeatureAdapter.ts
 * ======================
 * PBEF Component 3 — Causal Feature Extraction & Adapter
 * Transforms discrete session events into non-leaking, 30-second time-series windows
 * and activity snapshots conforming to the ONNX Model Contract (shape [1, 2, 30]).
 * 
 * Channels:
 *  - Channel 0: perf_counts (interaction count in each 1s bin)
 *  - Channel 1: inactivity (seconds since last interaction at each 1s bin)
 */

import { SessionEvent, ActivitySnapshot } from '../types/participation';

export interface PersonalBaselineStats {
  perfCountMean: number;
  perfCountStd: number;
  inactivityMean: number;
  inactivityStd: number;
  meanLatencyMs: number;
  isCalibrated: boolean;
  sampleCount: number;
}

export const DEFAULT_DEMO_BASELINE: PersonalBaselineStats = {
  perfCountMean: 0.85,
  perfCountStd: 0.45,
  inactivityMean: 0.45,
  inactivityStd: 0.80,
  meanLatencyMs: 1201,
  isCalibrated: true,
  sampleCount: 60,
};

export interface WindowFeatureExtraction {
  snapshot: ActivitySnapshot;
  binnedPerfCounts: number[];   // 30 elements (counts)
  binnedInactivity: number[];   // 30 elements (seconds)
  normalizedFeatures: number[]; // Flattened [2, 30] = 60 floats: Channel 0 (30) followed by Channel 1 (30)
  evidence: string[];
  dataValid: boolean;
  missingReason?: string;
}

/**
 * Calculates personal baseline statistics from the first 60 seconds of a session.
 */
export function calculatePersonalBaseline(
  events: SessionEvent[],
  calibrationDurationSec: number = 60
): PersonalBaselineStats {
  const calibEvents = events
    .filter((e) => e.timestamp_sec >= 0 && e.timestamp_sec < calibrationDurationSec)
    .sort((a, b) => a.timestamp_sec - b.timestamp_sec);

  const binCounts = new Array(calibrationDurationSec).fill(0);
  const binInactivity = new Array(calibrationDurationSec).fill(0);
  let lastAct = 0;

  for (let s = 0; s < calibrationDurationSec; s++) {
    const evtsInBin = calibEvents.filter(
      (e) => e.timestamp_sec >= s && e.timestamp_sec < s + 1
    );
    binCounts[s] = evtsInBin.length;
    if (evtsInBin.length > 0) {
      lastAct = s;
    }
    binInactivity[s] = s - lastAct;
  }

  const perfMean = binCounts.reduce((a, b) => a + b, 0) / calibrationDurationSec;
  const perfVar = binCounts.reduce((acc, v) => acc + Math.pow(v - perfMean, 2), 0) / calibrationDurationSec;
  const perfStd = Math.max(Math.sqrt(perfVar), 1e-3);

  const inactMean = binInactivity.reduce((a, b) => a + b, 0) / calibrationDurationSec;
  const inactVar = binInactivity.reduce((acc, v) => acc + Math.pow(v - inactMean, 2), 0) / calibrationDurationSec;
  const inactStd = Math.max(Math.sqrt(inactVar), 1e-3);

  const latencies = calibEvents
    .filter((e) => e.type === 'answer_submitted' && typeof e.metadata?.latencyMs === 'number')
    .map((e) => e.metadata!.latencyMs as number);

  const meanLat = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 1201;

  return {
    perfCountMean: parseFloat(perfMean.toFixed(4)),
    perfCountStd: parseFloat(perfStd.toFixed(4)),
    inactivityMean: parseFloat(inactMean.toFixed(4)),
    inactivityStd: parseFloat(inactStd.toFixed(4)),
    meanLatencyMs: Math.round(meanLat),
    isCalibrated: calibEvents.length > 0,
    sampleCount: calibrationDurationSec,
  };
}

/**
 * Extracts a causal 30-second observation window strictly preceding currentSec.
 */
export function extractCausalWindow(
  events: SessionEvent[],
  currentSec: number,
  historySec: number = 30,
  baseline: PersonalBaselineStats = DEFAULT_DEMO_BASELINE
): WindowFeatureExtraction {
  const windowStart = Math.max(0, currentSec - historySec);

  // Causal filter: strictly events occurring within [currentSec - 30, currentSec]
  const eligibleEvents = events
    .filter((e) => e.timestamp_sec >= windowStart && e.timestamp_sec <= currentSec)
    .sort((a, b) => a.timestamp_sec - b.timestamp_sec);

  // Guard: if currentSec < historySec, window is incomplete
  if (currentSec < historySec) {
    return {
      snapshot: {
        timestamp_sec: currentSec,
        answer_attempts_30s: 0,
        correct_answers_30s: 0,
        mean_response_latency_ms: null,
        inactivity_sec: currentSec,
        data_valid: false,
      },
      binnedPerfCounts: new Array(historySec).fill(0),
      binnedInactivity: new Array(historySec).fill(0),
      normalizedFeatures: new Array(2 * historySec).fill(0),
      evidence: [`Accumulating 30-second observation window (${Math.round(currentSec)}s / ${historySec}s)`],
      dataValid: false,
      missingReason: 'accumulating_window',
    };
  }

  // Count submitted answers without duplicate counting
  let answerAttempts = 0;
  let correctAnswers = 0;
  const latencies: number[] = [];

  for (const e of eligibleEvents) {
    if (e.type === 'answer_submitted') {
      answerAttempts++;
      if (e.metadata?.isCorrect === true) {
        correctAnswers++;
      }
      const lat = e.metadata?.latencyMs;
      if (typeof lat === 'number' && lat > 0) {
        latencies.push(lat);
      }
    }
  }

  // Inactivity: seconds elapsed since most recent interaction event
  let inactivitySec = 0;
  if (eligibleEvents.length > 0) {
    const lastEventTime = eligibleEvents[eligibleEvents.length - 1].timestamp_sec;
    inactivitySec = Math.max(0, parseFloat((currentSec - lastEventTime).toFixed(1)));
  } else {
    // Check all past events before windowStart if any exist
    const priorEvents = events.filter((e) => e.timestamp_sec <= currentSec);
    if (priorEvents.length > 0) {
      const lastPrior = Math.max(...priorEvents.map((e) => e.timestamp_sec));
      inactivitySec = Math.max(0, parseFloat((currentSec - lastPrior).toFixed(1)));
    } else {
      inactivitySec = currentSec;
    }
  }

  const meanLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  // Build 30 discrete 1-second bins: Channel 0 (perf_counts), Channel 1 (inactivity)
  const binnedPerfCounts: number[] = [];
  const binnedInactivity: number[] = [];

  let runningLastAct = windowStart;
  // Initialize runningLastAct from prior event before window start if present
  const priorToWindow = events.filter((e) => e.timestamp_sec < windowStart);
  if (priorToWindow.length > 0) {
    runningLastAct = Math.max(...priorToWindow.map((e) => e.timestamp_sec));
  }

  for (let b = 0; b < historySec; b++) {
    const binStart = windowStart + b;
    const binEnd = binStart + 1;
    const binEvts = eligibleEvents.filter(
      (e) => e.timestamp_sec >= binStart && e.timestamp_sec < binEnd
    );
    binnedPerfCounts.push(binEvts.length);
    if (binEvts.length > 0) {
      runningLastAct = binStart;
    }
    const binInact = Math.max(0, binEnd - runningLastAct);
    binnedInactivity.push(binInact);
  }

  // Personal Baseline Normalization: (value - mean) / std
  const normPerf = binnedPerfCounts.map((v) => (v - baseline.perfCountMean) / baseline.perfCountStd);
  const normInact = binnedInactivity.map((v) => (v - baseline.inactivityMean) / baseline.inactivityStd);

  // Flattened shape [2, 30]: Channel 0 first 30 elements, Channel 1 next 30 elements
  const normalizedFeatures = [...normPerf, ...normInact];

  // Observational evidence statements derived strictly from real events
  const evidence: string[] = [];
  if (inactivitySec > 5) {
    evidence.push(`No task interaction recorded for ${inactivitySec} seconds`);
  }
  if (meanLatency !== null) {
    if (meanLatency > baseline.meanLatencyMs * 1.5) {
      evidence.push(`Mean response time (${meanLatency}ms) elevated relative to calibrated baseline (${baseline.meanLatencyMs}ms)`);
    } else {
      evidence.push(`Response time steady at ${meanLatency}ms (baseline: ${baseline.meanLatencyMs}ms)`);
    }
  }
  if (answerAttempts > 0) {
    evidence.push(`${answerAttempts} answer ${answerAttempts === 1 ? 'attempt' : 'attempts'} in the last 30s (${correctAnswers} correct)`);
  } else if (inactivitySec >= 15) {
    evidence.push('Zero answer submissions in the current 30s observation window');
  }

  return {
    snapshot: {
      timestamp_sec: currentSec,
      answer_attempts_30s: answerAttempts,
      correct_answers_30s: correctAnswers,
      mean_response_latency_ms: meanLatency,
      inactivity_sec: inactivitySec,
      data_valid: true,
    },
    binnedPerfCounts,
    binnedInactivity,
    normalizedFeatures,
    evidence: evidence.length > 0 ? evidence : ['Interactions in nominal expected range'],
    dataValid: true,
  };
}
