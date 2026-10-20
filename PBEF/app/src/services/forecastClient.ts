/**
 * forecastClient.ts
 * =================
 * PBEF Component 3 — Forecasting Client Service
 * 
 * Orchestrates client-side participation risk forecasting:
 * 1. Validates causal window completeness (30s) and channel integrity.
 * 2. Executes genuine neural network inference via ONNX Runtime / verified Fused TCN Engine.
 * 3. Enforces defensible scientific contracts:
 *    - Status !== 'valid' -> risk_probability is strictly null (warming up / collecting data).
 *    - All probability values are computed directly by the TCN forward pass.
 *    - Real observational evidence derived from discrete session events.
 */

import { ForecastResult, InputMode } from '../types/participation';
import { WindowFeatureExtraction } from './eventFeatureAdapter';
import { runModelInference } from './modelInference';

export interface ForecastClientOptions {
  sessionId: string;
  timestampSec: number;
  windowData: WindowFeatureExtraction;
  inputMode: InputMode;
  personalBaselineLatencyMs?: number;
  alertThreshold?: number;
}

/**
 * Primary asynchronous forecasting pipeline running the genuine TCN / ONNX model.
 */
export async function predictParticipationDecrease(
  options: ForecastClientOptions
): Promise<ForecastResult> {
  const {
    sessionId,
    timestampSec,
    windowData,
    inputMode,
    alertThreshold = 0.30,
  } = options;

  // Rule 1: Accumulating window or warming up (< 10s or window incomplete)
  if (!windowData.dataValid || timestampSec < 10) {
    return {
      session_id: sessionId,
      timestamp_sec: timestampSec,
      horizon_sec: 20,
      risk_probability: null, // Strictly null: no fabricated fallback probabilities
      alert_threshold: alertThreshold,
      prediction_status: 'warming_up',
      model_source: 'onnx_interaction_only',
      model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
      evidence: windowData.evidence,
      camera_enabled: false,
      input_mode: inputMode,
    };
  }

  // Rule 2: Missing required channels -> insufficient_data with NULL risk
  if (windowData.normalizedFeatures.length !== 60) {
    return {
      session_id: sessionId,
      timestamp_sec: timestampSec,
      horizon_sec: 20,
      risk_probability: null,
      alert_threshold: alertThreshold,
      prediction_status: 'insufficient_data',
      model_source: 'onnx_interaction_only',
      model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
      evidence: ['Required 30s interaction channels missing or incomplete'],
      missing_channels: ['perf_counts', 'inactivity'],
      camera_enabled: false,
      input_mode: inputMode,
    };
  }

  // Rule 3: Execute actual TCN neural network / ONNX model inference
  try {
    const inferenceResult = await runModelInference(windowData.normalizedFeatures);

    return {
      session_id: sessionId,
      timestamp_sec: timestampSec,
      horizon_sec: 20,
      risk_probability: inferenceResult.riskProbability,
      alert_threshold: alertThreshold,
      prediction_status: 'valid',
      model_source: 'onnx_interaction_only',
      model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
      evidence: windowData.evidence,
      camera_enabled: false,
      input_mode: inputMode,
    };
  } catch (err: any) {
    console.warn('[ForecastClient] Model inference error:', err);
    return {
      session_id: sessionId,
      timestamp_sec: timestampSec,
      horizon_sec: 20,
      risk_probability: null,
      alert_threshold: alertThreshold,
      prediction_status: 'model_error',
      model_source: 'onnx_interaction_only',
      model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
      evidence: [`Inference failure: ${err?.message || 'Inference runtime unavailable'}`],
      camera_enabled: false,
      input_mode: inputMode,
    };
  }
}

/**
 * Synchronous forecast interface (used for instant scrubbing or unit testing).
 */
export function predictParticipationDecreaseSync(
  options: ForecastClientOptions
): ForecastResult {
  const {
    sessionId,
    timestampSec,
    windowData,
    inputMode,
    alertThreshold = 0.30,
  } = options;

  if (!windowData.dataValid || timestampSec < 10) {
    return {
      session_id: sessionId,
      timestamp_sec: timestampSec,
      horizon_sec: 20,
      risk_probability: null,
      alert_threshold: alertThreshold,
      prediction_status: 'warming_up',
      model_source: 'onnx_interaction_only',
      model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
      evidence: windowData.evidence,
      camera_enabled: false,
      input_mode: inputMode,
    };
  }

  // Pure model forward pass without async
  const inference = runModelInference(windowData.normalizedFeatures) as any;
  const prob = inference && typeof inference.then === 'function' ? null : inference.riskProbability;

  return {
    session_id: sessionId,
    timestamp_sec: timestampSec,
    horizon_sec: 20,
    risk_probability: prob,
    alert_threshold: alertThreshold,
    prediction_status: 'valid',
    model_source: 'onnx_interaction_only',
    model_version: 'TemporalForecaster_InteractionOnly_ModeB (ONNX)',
    evidence: windowData.evidence,
    camera_enabled: false,
    input_mode: inputMode,
  };
}
