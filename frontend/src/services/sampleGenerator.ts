/**
 * Client-side synthetic gesture feature generator matching preprocessing/normalizer.py.
 * Generates exact [32, 128] Float32Array features for testing in-browser ONNX inference.
 */

import type { IntentMessage } from '../types';

export function generateTestFeatures(intent: IntentMessage): Float32Array {
  const timeSteps = 32;
  const featureDim = 128;
  const features = new Float32Array(timeSteps * featureDim);

  // Hand templates (21 landmarks)
  const openHand: number[][] = [];
  for (let i = 0; i < 21; i++) {
    if (i === 0) openHand.push([0, 0, 0]);
    else if (i <= 4) openHand.push([0.08 + 0.04 * i, 0.15 + 0.04 * i, 0]);
    else if (i <= 8) openHand.push([0.04, 0.25 + 0.08 * (i - 5), 0]);
    else if (i <= 12) openHand.push([0.0, 0.30 + 0.08 * (i - 9), 0]);
    else if (i <= 16) openHand.push([-0.04, 0.26 + 0.07 * (i - 13), 0]);
    else openHand.push([-0.08, 0.20 + 0.06 * (i - 17), 0]);
  }

  const fistHand: number[][] = [];
  for (let i = 0; i < 21; i++) {
    if (i === 0) fistHand.push([0, 0, 0]);
    else if (i <= 4) fistHand.push([0.05 + 0.02 * i, 0.08, 0.04]);
    else if (i <= 8) fistHand.push([0.03, 0.08 + 0.02 * (i - 5), -0.05]);
    else if (i <= 12) fistHand.push([0.0, 0.08 + 0.02 * (i - 9), -0.05]);
    else if (i <= 16) fistHand.push([-0.03, 0.07 + 0.02 * (i - 13), -0.05]);
    else fistHand.push([-0.06, 0.06 + 0.02 * (i - 17), -0.05]);
  }

  const pointingHand = fistHand.map(pt => [...pt]);
  for (let i = 5; i <= 8; i++) {
    pointingHand[i] = [0.03, 0.25 + 0.08 * (i - 5), 0.0];
  }

  const palmScale = 0.35;

  for (let t = 0; t < timeSteps; t++) {
    const normT = t / (timeSteps - 1);
    const rowOffset = t * featureDim;

    let maskL = 0;
    let maskR = 0;

    let wristDispRx = 0;
    let wristDispRy = 0;
    let wristDispRz = 0;

    let wristDispLx = 0;
    let wristDispLy = 0;

    let handShapeR = openHand;
    let handShapeL = openHand;

    if (intent === 'Help') {
      maskR = 1;
      handShapeR = openHand;
      const sig = 1 / (1 + Math.exp(-8 * (normT - 0.4)));
      wristDispRy = (-0.35 * sig) / palmScale;
      wristDispRx = (0.02 * Math.sin(4 * Math.PI * normT)) / palmScale;
    } else if (intent === 'Break') {
      maskL = 1;
      maskR = 1;
      handShapeL = openHand;
      handShapeR = openHand;
      wristDispLx = (0.16 * normT) / palmScale;
      wristDispLy = (0.04 * Math.sin(Math.PI * normT)) / palmScale;
      wristDispRx = (-0.16 * normT) / palmScale;
      wristDispRy = (0.04 * Math.sin(Math.PI * normT)) / palmScale;
    } else if (intent === 'Finished') {
      maskL = 1;
      maskR = 1;
      handShapeL = openHand;
      handShapeR = openHand;
      wristDispLx = (-0.22 * Math.sin(Math.PI * normT)) / palmScale;
      wristDispLy = (-0.08 * Math.sin(Math.PI * normT)) / palmScale;
      wristDispRx = (0.22 * Math.sin(Math.PI * normT)) / palmScale;
      wristDispRy = (-0.08 * Math.sin(Math.PI * normT)) / palmScale;
    } else if (intent === 'Yes') {
      maskR = 1;
      handShapeR = fistHand;
      wristDispRz = (-0.25 * Math.sin(Math.PI * normT)) / palmScale;
      wristDispRy = (0.06 * Math.sin(2 * Math.PI * normT)) / palmScale;
    } else if (intent === 'No') {
      maskR = 1;
      handShapeR = pointingHand;
      wristDispRx = (0.16 * Math.sin(4 * Math.PI * normT)) / palmScale;
      wristDispRy = (0.02 * Math.cos(2 * Math.PI * normT)) / palmScale;
    }

    // Hand 0 (Left): coords 0..62
    if (maskL === 1) {
      features[rowOffset + 0] = wristDispLx;
      features[rowOffset + 1] = wristDispLy;
      features[rowOffset + 2] = 0;
      for (let i = 1; i < 21; i++) {
        features[rowOffset + i * 3 + 0] = handShapeL[i][0] / palmScale;
        features[rowOffset + i * 3 + 1] = handShapeL[i][1] / palmScale;
        features[rowOffset + i * 3 + 2] = handShapeL[i][2] / palmScale;
      }
    }

    // Hand 1 (Right): coords 63..125
    if (maskR === 1) {
      const baseR = rowOffset + 63;
      features[baseR + 0] = wristDispRx;
      features[baseR + 1] = wristDispRy;
      features[baseR + 2] = wristDispRz;
      for (let i = 1; i < 21; i++) {
        features[baseR + i * 3 + 0] = handShapeR[i][0] / palmScale;
        features[baseR + i * 3 + 1] = handShapeR[i][1] / palmScale;
        features[baseR + i * 3 + 2] = handShapeR[i][2] / palmScale;
      }
    }

    // Masks at indices 126 and 127
    features[rowOffset + 126] = maskL;
    features[rowOffset + 127] = maskR;
  }

  return features;
}
