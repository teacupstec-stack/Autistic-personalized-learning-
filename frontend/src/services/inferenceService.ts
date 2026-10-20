/**
 * Browser ONNX Runtime Web inference engine for PUSG-Fusion (Component 1).
 * Loads:
 * 1. /models/pusg_fusion_encoder.onnx (PyTorch exported 1D-CNN + BiGRU + Attention encoder)
 * 2. /models/prototype_bank.json (Personal prototype vectors and decision thresholds)
 */

import * as ort from 'onnxruntime-web';
import type { IntentMessage, ModelStatusType } from '../types';
import { personalPrototypes } from './personalMemory';

export interface PrototypeBank {
  intents: IntentMessage[];
  model_version: string;
  confidence_threshold: number;
  margin_threshold: number;
  prototypes: number[][]; // [5, 64]
}

export interface InferenceResult {
  embedding: number[];
  intentProbabilities: Record<IntentMessage, number>;
  candidateIntent: IntentMessage;
  confidence: number;
  margin: number;
  confirmationStatus: 'inferred_gesture' | 'pending_clarification' | 'confirmed_symbol';
  clarificationFlag: boolean;
  modelVersion: string;
  latencyMs: number;
}

class InferenceService {
  private session: ort.InferenceSession | null = null;
  private prototypeBank: PrototypeBank | null = null;
  private status: ModelStatusType = 'not_loaded';
  private loadingPromise: Promise<boolean> | null = null;

  public async initialize(): Promise<ModelStatusType> {
    if (this.session && this.prototypeBank) {
      return 'ready';
    }
    if (this.loadingPromise) {
      const ok = await this.loadingPromise;
      return ok ? 'ready' : 'error';
    }

    this.loadingPromise = (async () => {
      try {
        // Configure ONNX Runtime Web WASM paths
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;

        // 1. Fetch prototype bank JSON
        const protoRes = await fetch('/models/prototype_bank.json');
        if (!protoRes.ok) {
          throw new Error(`Failed to load prototype bank (HTTP ${protoRes.status})`);
        }
        this.prototypeBank = (await protoRes.json()) as PrototypeBank;

        // 2. Create Inference Session for ONNX model
        this.session = await ort.InferenceSession.create('/models/pusg_fusion_encoder.onnx', {
          executionProviders: ['wasm'],
        });

        this.status = 'ready';
        return true;
      } catch (err) {
        console.warn('InferenceService: Could not load ONNX model or prototype bank:', err);
        this.status = 'not_loaded';
        return false;
      }
    })();

    const success = await this.loadingPromise;
    this.loadingPromise = null;
    return success ? 'ready' : 'not_loaded';
  }

  public getStatus(): ModelStatusType {
    return this.status;
  }

  public getPrototypeBank(): PrototypeBank | null {
    return this.prototypeBank;
  }

  /**
   * Runs inference on a normalized [32, 128] feature matrix.
   */
  public async predict(features: number[][] | Float32Array, participantId?: string): Promise<InferenceResult | null> {
    if (!this.session || !this.prototypeBank) {
      return null;
    }

    const t0 = performance.now();

    // Flatten features to 32 * 128 = 4096 floats
    let flatData: Float32Array;
    if (features instanceof Float32Array) {
      flatData = features;
    } else {
      flatData = new Float32Array(32 * 128);
      let idx = 0;
      for (let t = 0; t < 32; t++) {
        for (let d = 0; d < 128; d++) {
          flatData[idx++] = features[t]?.[d] ?? 0.0;
        }
      }
    }

    // Prepare ONNX tensor [1, 32, 128]
    const tensor = new ort.Tensor('float32', flatData, [1, 32, 128]);
    const feeds = { gesture_sequence: tensor };
    const outputs = await this.session.run(feeds);
    const outputTensor = outputs.gesture_embedding;
    const embedding = outputTensor.data as Float32Array; // [64]

    // Normalize embedding vector
    let norm = 0;
    for (let i = 0; i < 64; i++) norm += embedding[i] * embedding[i];
    norm = Math.sqrt(norm) || 1e-6;
    const normEmbed = new Float32Array(64);
    for (let i = 0; i < 64; i++) normEmbed[i] = embedding[i] / norm;

    // Compute cosine similarity against the 5 personal prototypes
    const intents = this.prototypeBank.intents;
    const rawScores: number[] = [];
    const personal = participantId ? personalPrototypes(participantId) : [];

    for (let c = 0; c < intents.length; c++) {
      const proto = personal[c] ?? this.prototypeBank.prototypes[c];
      let dot = 0;
      for (let i = 0; i < 64; i++) {
        dot += normEmbed[i] * (proto[i] ?? 0);
      }
      rawScores.push(dot);
    }

    // Temperature-scaled softmax over similarities
    const temperature = 0.25;
    const expScores = rawScores.map(s => Math.exp(s / temperature));
    const sumExp = expScores.reduce((a, b) => a + b, 0) || 1;
    const probs = expScores.map(e => e / sumExp);

    // Find top-1 and top-2
    const sortedIndices = probs
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => b.p - a.p);

    const top1 = sortedIndices[0];
    const top2 = sortedIndices[1];
    const margin = top1.p - top2.p;
    const candidateIntent = intents[top1.idx];
    const confidence = parseFloat(top1.p.toFixed(4));

    // Clarification thresholding
    const confThresh = this.prototypeBank.confidence_threshold ?? 0.70;
    const marginThresh = this.prototypeBank.margin_threshold ?? 0.15;
    const clarificationFlag = (top1.p < confThresh) || (margin < marginThresh);

    const latencyMs = parseFloat((performance.now() - t0).toFixed(2));

    const probMap: Record<IntentMessage, number> = {
      Help: parseFloat(probs[intents.indexOf('Help')].toFixed(4)),
      Break: parseFloat(probs[intents.indexOf('Break')].toFixed(4)),
      Finished: parseFloat(probs[intents.indexOf('Finished')].toFixed(4)),
      Yes: parseFloat(probs[intents.indexOf('Yes')].toFixed(4)),
      No: parseFloat(probs[intents.indexOf('No')].toFixed(4)),
    };

    return {
      embedding: Array.from(normEmbed),
      intentProbabilities: probMap,
      candidateIntent,
      confidence,
      margin: parseFloat(margin.toFixed(4)),
      confirmationStatus: clarificationFlag ? 'pending_clarification' : 'inferred_gesture',
      clarificationFlag,
      modelVersion: this.prototypeBank.model_version,
      latencyMs,
    };
  }
}

export const inferenceService = new InferenceService();
