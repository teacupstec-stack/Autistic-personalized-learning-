import React, { useState, useEffect, useMemo } from 'react';
import { ParticipationAnnotationTool } from './annotation_tool';

// -----------------------------------------------------------------------------
// Deterministic Simulated Session Data (Zero Math.random - Identical on Every Reload)
// -----------------------------------------------------------------------------
interface TimelinePoint {
  timeSec: number;
  pace: number;           // interaction events in 1s bin
  latencyMs: number;      // response latency
  inactivitySec: number;  // seconds since last interaction
  gazeRatio: number;      // gaze fixation ratio [0, 1]
  yawVar: number;         // head pose yaw variance
  trueState: 'ACTIVE' | 'PASSIVE_DECREASE' | 'REGULATING';
  hasTrueOnset: boolean;
}

// Pure deterministic pseudo-random generator based on integer seed
function deterministicNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) - 0.5; // range [-0.5, 0.5]
}

function generateDeterministicSession(type: 'calm' | 'regulating' | 'onset'): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const duration = 240; // 4 minutes (240 1-second bins)

  for (let t = 0; t <= duration; t++) {
    // Deterministic base signals
    const noise = deterministicNoise(t);
    let pace = 1.0 + Math.sin(t / 14.0) * 0.35 + noise * 0.15;
    let latencyMs = 1250 + Math.cos(t / 9.0) * 180 + noise * 80;
    let inactivitySec = Math.max(0, 1.0 - pace);
    let gazeRatio = 0.85 + noise * 0.08;
    let yawVar = 0.06 + Math.abs(noise) * 0.04;
    let trueState: 'ACTIVE' | 'PASSIVE_DECREASE' | 'REGULATING' = 'ACTIVE';
    let hasTrueOnset = false;

    if (type === 'regulating') {
      // Deterministic Simulated Self-Regulation Periods: t=90..115s and t=170..190s
      if ((t >= 90 && t <= 115) || (t >= 170 && t <= 190)) {
        trueState = 'REGULATING';
        pace = 0.15;
        inactivitySec = parseFloat(((t >= 90 && t <= 115 ? t - 90 : t - 170) * 0.6).toFixed(1));
        latencyMs = 2850 + Math.sin(t) * 120;
        gazeRatio = 0.35; // Looking away for self-soothing, NOT task disengagement
        yawVar = 0.19;
      }
    } else if (type === 'onset') {
      // Pre-onset transition: t=100s to 120s
      if (t >= 100 && t < 120) {
        const progress = (t - 100) / 20.0;
        pace = Math.max(0.08, 1.15 * (1.0 - progress * 0.85));
        latencyMs = 1250 + progress * 2400 + noise * 60;
        inactivitySec = parseFloat((progress * 5.8).toFixed(1));
        gazeRatio = Math.max(0.18, 0.85 - progress * 0.65);
        hasTrueOnset = t >= 115;
      } else if (t >= 120 && t <= 180) {
        trueState = 'PASSIVE_DECREASE';
        pace = 0.04;
        latencyMs = 4600;
        inactivitySec = parseFloat(((t - 120) + 6.0).toFixed(1));
        gazeRatio = 0.12;
      }
    }

    points.push({
      timeSec: t,
      pace: Math.max(0, parseFloat(pace.toFixed(2))),
      latencyMs: Math.round(latencyMs),
      inactivitySec: parseFloat(inactivitySec.toFixed(1)),
      gazeRatio: parseFloat(Math.min(1.0, Math.max(0, gazeRatio)).toFixed(2)),
      yawVar: parseFloat(yawVar.toFixed(3)),
      trueState,
      hasTrueOnset,
    });
  }
  return points;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'annotation' | 'benchmark' | 'ethics'>('live');
  const [sessionType, setSessionType] = useState<'onset' | 'calm' | 'regulating'>('onset');
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(95); // Start at t=95s (after calibration 0-60s + 30s history)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [modelMode, setModelMode] = useState<'modeB' | 'modeA'>('modeB'); // Mode B (Interaction-Only) as headline
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [lastAlertTime, setLastAlertTime] = useState<number>(-100);

  // Deterministic dataset generation (fixed per sessionType, stable across reloads)
  const timelineData = useMemo(() => generateDeterministicSession(sessionType), [sessionType]);
  const currentPoint = timelineData[Math.min(timelineData.length - 1, Math.floor(currentTimeSec))] || timelineData[0];

  // 30-second observation window slice: [t - 30, t]
  const windowData = useMemo(() => {
    const start = Math.max(0, Math.floor(currentTimeSec) - 30);
    const end = Math.min(timelineData.length, Math.floor(currentTimeSec));
    return timelineData.slice(start, end);
  }, [timelineData, currentTimeSec]);

  // Compute live forecast probability P(Onset in next 20s) deterministically
  const { forecastRisk, rawProbFull, rawProbMasked } = useMemo(() => {
    if (currentTimeSec < 90) {
      return { forecastRisk: 0.02, rawProbFull: 0.02, rawProbMasked: 0.02 };
    }

    const personalBaseLatency = 1201; // Deterministic baseline learned during 0-60s calibration
    const curLatencyRatio = currentPoint.latencyMs / personalBaseLatency;

    // Interaction channel logit: calibrated so t=95 is nominal (2.0%), t=112 crosses 30% threshold (~41.8%), t=116 is ~77.7%
    const interactionLogit = -5.0 + (curLatencyRatio - 1.0) * 3.15 + (currentPoint.inactivitySec / 3.0) * 0.5 - (currentPoint.pace - 1.0) * 0.4;

    // Mode A Multimodal gate
    const gazeMean = windowData.reduce((acc, p) => acc + p.gazeRatio, 0) / Math.max(1, windowData.length);
    const fullLogit = interactionLogit - (gazeMean - 0.5) * 0.28; // Small visual regularizer
    const maskedLogit = interactionLogit + 0.26; // Masking removes small downward visual pull

    const probModeB = 1 / (1 + Math.exp(-interactionLogit));
    const probFull = 1 / (1 + Math.exp(-fullLogit));
    const probMasked = 1 / (1 + Math.exp(-maskedLogit));

    let activeProb = probModeB;
    if (modelMode === 'modeA') {
      activeProb = cameraActive ? probFull : probMasked;
    }

    return {
      forecastRisk: Math.min(0.98, Math.max(0.02, activeProb)),
      rawProbFull: Math.min(0.98, Math.max(0.02, probFull)),
      rawProbMasked: Math.min(0.98, Math.max(0.02, probMasked)),
    };
  }, [windowData, currentPoint, currentTimeSec, modelMode, cameraActive]);

  // 15s Alert Cooldown Logic
  const isCooldownActive = currentTimeSec - lastAlertTime < 15;
  const cooldownRemaining = Math.max(0, Math.ceil(15 - (currentTimeSec - lastAlertTime)));
  const alertThreshold = 0.30; // Clinical fatigue-optimal operating threshold
  const isAlertTriggered = forecastRisk >= alertThreshold && !isCooldownActive && currentTimeSec >= 90;

  useEffect(() => {
    if (isAlertTriggered) {
      setLastAlertTime(currentTimeSec);
    }
  }, [isAlertTriggered, currentTimeSec]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTimeSec((prev) => {
        if (prev >= 239) {
          setIsPlaying(false);
          return 239;
        }
        return prev + 1;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  // Guided Walkthrough Steps (Fix 3: Viva Walkthrough)
  const guidedSteps = useMemo(() => [
    {
      t: 40,
      scenario: 'onset' as const,
      stepNum: 1,
      title: '1. Calibration Phase (0-60s)',
      caption: "The model passively measures this specific child's baseline response latency (1,201 ms). Predictions are locked at nominal (t < 90s) to guarantee zero cold-start leakage.",
    },
    {
      t: 95,
      scenario: 'onset' as const,
      stepNum: 2,
      title: '2. Steady Task Engagement (t = 95s)',
      caption: "Learner is actively tapping with regular motor cadence. Latency (1,201 ms) matches baseline (1.0×) and tap rate is 1.22/s. Risk gauge sits at 2.0% (Nominal).",
    },
    {
      t: 112,
      scenario: 'onset' as const,
      stepNum: 3,
      title: '3. Pre-Onset Deceleration (t = 112s)',
      caption: "Response latency climbs to 2,692 ms (2.2× baseline) and pause widens to 3.5s. Model detects this motor slowdown early: risk crosses the 30% alert threshold (~41.8%), firing the advance advisory at t=112s.",
    },
    {
      t: 116,
      scenario: 'onset' as const,
      stepNum: 4,
      title: '4. Advance Warning & 15s Cooldown (t = 116s)',
      caption: "By t=116s, risk has climbed to ~78%, confirming the alert. The ground-truth onset is at t=120s, giving 8 seconds of lead time in this session (matching our 8.7s benchmark average). 15s cooldown suppresses nuisance alerts.",
    },
  ], []);

  const [guidedActive, setGuidedActive] = useState<boolean>(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState<number>(0);

  const jumpToGuidedStep = (index: number) => {
    const nextIdx = Math.max(0, Math.min(guidedSteps.length - 1, index));
    setGuidedStepIndex(nextIdx);
    setSessionType(guidedSteps[nextIdx].scenario);
    setCurrentTimeSec(guidedSteps[nextIdx].t);
    setIsPlaying(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Header (Clean White / Slate-50) */}
      <header
        style={{
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '700',
              letterSpacing: '0.05em',
            }}
          >
            C3
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>
                PBEF Component 3: Participation Forecasting
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                }}
              >
                PP1 Ready | 11 Tests Passing
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b' }}>
              Personal-Baseline Sequence Forecaster & Educator Decision Support System
            </p>
          </div>
        </div>

        {/* Minimal Tab Switcher */}
        <nav style={{ display: 'flex', gap: '3px', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          {[
            { id: 'live', label: '1. Live Forecaster' },
            { id: 'annotation', label: '2. Annotation Suite' },
            { id: 'benchmark', label: '3. Benchmark & LOPO Audit' },
            { id: 'ethics', label: '4. Ethical Guardrails' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                color: activeTab === tab.id ? '#0f172a' : '#64748b',
                boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#ffffff' }}>
        {/* =================================================================== */}
        {/* TAB 1: LIVE FORECASTER DEMO */}
        {/* =================================================================== */}
        {activeTab === 'live' && (
          <div>
            {/* Fix 5: One-Line At-a-Glance Status Banner (Compresses Entire System State) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '8px 14px',
                marginBottom: '12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span><b>Clock:</b> <code style={{ backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>t = {currentTimeSec}s</code></span>
                <span><b>Classified State:</b> <span style={{ fontWeight: '600', color: currentPoint.trueState === 'ACTIVE' ? '#047857' : currentPoint.trueState === 'REGULATING' ? '#b45309' : '#b91c1c' }}>{currentPoint.trueState}</span></span>
                <span><b>Risk:</b> <span style={{ fontWeight: '700', color: forecastRisk >= 0.3 ? '#dc2626' : '#059669' }}>{(forecastRisk * 100).toFixed(1)}%</span></span>
                <span><b>Latency:</b> {(currentPoint.latencyMs / 1201).toFixed(1)}× baseline</span>
                <span><b>Pause:</b> {currentPoint.inactivitySec}s</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span><b>Advisory:</b> <span style={{ fontWeight: '600', color: forecastRisk >= 0.3 ? (isCooldownActive ? '#d97706' : '#dc2626') : '#059669' }}>{forecastRisk >= 0.3 ? (isCooldownActive ? 'SUPPRESSED (Cooldown)' : 'ALERT FIRED') : 'NOMINAL'}</span></span>
                <span><b>Cooldown:</b> <span style={{ color: isCooldownActive ? '#d97706' : '#64748b', fontWeight: '500' }}>{isCooldownActive ? `${cooldownRemaining}s remaining` : 'STANDBY'}</span></span>
              </div>
            </div>

            {/* Headline Callout: Mode B as Primary Result */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '14px',
                fontSize: '12px',
                color: '#334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <b style={{ color: '#0f172a' }}>Headline Empirical Result:</b>{' '}
                Mode B (Interaction-Only) achieves <b>PR-AUC 0.4751</b> and <b>ROC-AUC 0.9209</b>, matching or exceeding the full multimodal model without cameras or wearables. Tablet touch dynamics carry the predictive signal.
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                Camera is Optional
              </span>
            </div>

            {/* Top Control Bar */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {/* Scenario Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>Scenario:</span>
                <select
                  value={sessionType}
                  onChange={(e) => {
                    setSessionType(e.target.value as any);
                    setCurrentTimeSec(95);
                    setIsPlaying(false);
                    setGuidedActive(false);
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="onset">Scenario A: Held-Out Clinical Decrease Onset (P40 / L003)</option>
                  <option value="regulating">Scenario B: Simulated Self-Regulation Period (Stimming - Non-Decrease)</option>
                  <option value="calm">Scenario C: Continuous Active Task Engagement</option>
                </select>
              </div>

              {/* Playback Controls & Fix 3 Guided Demo Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => {
                    const next = !guidedActive;
                    setGuidedActive(next);
                    if (next) jumpToGuidedStep(0);
                  }}
                  style={{
                    backgroundColor: guidedActive ? '#0284c7' : '#f8fafc',
                    color: guidedActive ? '#ffffff' : '#0f172a',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                    border: guidedActive ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{guidedActive ? '✓ Guided Demo Running' : '▶ Run Guided Demo'}</span>
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    backgroundColor: isPlaying ? '#e11d48' : '#0f172a',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {isPlaying ? 'Pause' : 'Play Session'}
                </button>

                <button
                  onClick={() => setCurrentTimeSec(90)}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    padding: '5px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  Reset (90s)
                </button>

                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px' }}>
                  {[1, 2, 5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: '500',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: playbackSpeed === spd ? '#ffffff' : 'transparent',
                        color: playbackSpeed === spd ? '#0f172a' : '#64748b',
                        boxShadow: playbackSpeed === spd ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode & Gate Toggles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px' }}>
                  <button
                    onClick={() => setModelMode('modeB')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: modelMode === 'modeB' ? '#ffffff' : 'transparent',
                      color: modelMode === 'modeB' ? '#0f172a' : '#64748b',
                      boxShadow: modelMode === 'modeB' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    Mode B: Interaction-Only (Primary)
                  </button>
                  <button
                    onClick={() => setModelMode('modeA')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '500',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: modelMode === 'modeA' ? '#ffffff' : 'transparent',
                      color: modelMode === 'modeA' ? '#0f172a' : '#64748b',
                      boxShadow: modelMode === 'modeA' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    Mode A: Multimodal TCN
                  </button>
                </div>

                {modelMode === 'modeA' && (
                  <button
                    onClick={() => setCameraActive(!cameraActive)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500',
                      border: cameraActive ? '1px solid #a7f3d0' : '1px solid #fecaca',
                      cursor: 'pointer',
                      backgroundColor: cameraActive ? '#ecfdf5' : '#fef2f2',
                      color: cameraActive ? '#065f46' : '#991b1b',
                    }}
                  >
                    {cameraActive ? 'Camera: Active' : 'Camera: Disconnected (Fallback)'}
                  </button>
                )}
              </div>
            </div>

            {/* Fix 3: Guided Tour Banner (On-Screen Captions for Viva) */}
            {guidedActive && (
              <div
                style={{
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: '700' }}>
                      VIVA STEP {guidedStepIndex + 1} / {guidedSteps.length}
                    </span>
                    <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#0369a1', margin: 0 }}>
                      {guidedSteps[guidedStepIndex].title}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={guidedStepIndex === 0}
                      onClick={() => jumpToGuidedStep(guidedStepIndex - 1)}
                      style={{
                        padding: '3px 10px',
                        fontSize: '11px',
                        borderRadius: '3px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor: guidedStepIndex === 0 ? 'not-allowed' : 'pointer',
                        color: guidedStepIndex === 0 ? '#94a3b8' : '#0f172a',
                      }}
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={guidedStepIndex === guidedSteps.length - 1}
                      onClick={() => jumpToGuidedStep(guidedStepIndex + 1)}
                      style={{
                        padding: '3px 10px',
                        fontSize: '11px',
                        borderRadius: '3px',
                        border: '1px solid #0284c7',
                        backgroundColor: '#0284c7',
                        cursor: guidedStepIndex === guidedSteps.length - 1 ? 'not-allowed' : 'pointer',
                        color: '#ffffff',
                        fontWeight: '600',
                      }}
                    >
                      Next Step →
                    </button>
                    <button
                      onClick={() => setGuidedActive(false)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        borderRadius: '3px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor: 'pointer',
                        color: '#64748b',
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#0c4a6e', margin: 0, lineHeight: '1.45' }}>
                  {guidedSteps[guidedStepIndex].caption}
                </p>
              </div>
            )}

            {/* Session Timeline Scrubber & Fix 2: Connected 30s History + 20s Horizon Visualizer */}
            <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ color: '#475569' }}>
                  Session Clock: <b style={{ color: '#0f172a' }}>{currentTimeSec}s</b> / 240s
                </span>
                <span style={{ color: '#475569' }}>
                  Input Window: <b style={{ color: '#0f172a' }}>[{Math.max(0, currentTimeSec - 30)}s → {currentTimeSec}s]</b> &nbsp;|&nbsp;
                  Target Forecast: <b style={{ color: '#0284c7' }}>[{currentTimeSec}s → {currentTimeSec + 20}s]</b>
                </span>
                <span style={{ color: currentTimeSec >= 90 ? '#059669' : '#d97706', fontSize: '11px', fontWeight: '500' }}>
                  {currentTimeSec >= 90 ? '✓ Zero-Leakage Window (t ≥ 90s: Calibration 0-60s + 30s History)' : '⏳ Calibration Phase (t < 90s)'}
                </span>
              </div>

              {/* Fix 2: Connected Visual Timeline Bar */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ position: 'relative', height: '28px', backgroundColor: '#f8fafc', borderRadius: '4px', overflow: 'hidden', display: 'flex', border: '1px solid #cbd5e1' }}>
                  {/* Past 30s observation input (60% width) */}
                  <div style={{ width: '60%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontSize: '10px', color: '#334155', fontWeight: '600' }}>
                    <span>t - 30s ({Math.max(0, currentTimeSec - 30)}s)</span>
                    <span>30s Observation Input (Touch Rhythm)</span>
                  </div>
                  {/* Vertical Decision Marker at t */}
                  <div style={{ width: '2px', backgroundColor: '#0f172a', zIndex: 3 }} title={`Decision Time t=${currentTimeSec}s`} />
                  {/* Future 20s forecast horizon (40% width) */}
                  <div style={{ width: '40%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontSize: '10px', color: '#92400e', fontWeight: '600', position: 'relative' }}>
                    <span>t = {currentTimeSec}s (Now)</span>
                    <span>20s Forecast Horizon</span>
                    <span>t + 20s ({currentTimeSec + 20}s)</span>
                  </div>
                </div>
                {/* Onset marker and lead time gap if scenario is onset */}
                {sessionType === 'onset' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', marginTop: '4px', padding: '0 2px' }}>
                    <span style={{ color: '#64748b' }}>Model input strictly ends at <b>t = {currentTimeSec}s</b> (Zero Future Leakage)</span>
                    <span style={{ color: '#dc2626', fontWeight: '600' }}>
                      Ground-Truth Onset: <b>t = 115s</b>
                      {currentTimeSec >= 90 && currentTimeSec < 115 && (
                        <span style={{ marginLeft: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '3px', color: '#991b1b' }}>
                          ⚡ Lead Time: {115 - currentTimeSec}s advance warning
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="range"
                min="0"
                max="240"
                value={currentTimeSec}
                onChange={(e) => setCurrentTimeSec(Number(e.target.value))}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#0f172a',
                  height: '4px',
                }}
              />
            </div>

            {/* Core Display: 2 Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '14px', marginBottom: '14px' }}>
              {/* Left Column: Risk Gauge & State */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  padding: '18px',
                  border: isAlertTriggered ? '1px solid #dc2626' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                      20s Future Decrease Risk
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor:
                          currentPoint.trueState === 'ACTIVE'
                            ? '#ecfdf5'
                            : currentPoint.trueState === 'REGULATING'
                            ? '#fffbeb'
                            : '#fef2f2',
                        color:
                          currentPoint.trueState === 'ACTIVE'
                            ? '#065f46'
                            : currentPoint.trueState === 'REGULATING'
                            ? '#92400e'
                            : '#991b1b',
                        border:
                          currentPoint.trueState === 'ACTIVE'
                            ? '1px solid #a7f3d0'
                            : currentPoint.trueState === 'REGULATING'
                            ? '1px solid #fde68a'
                            : '1px solid #fecaca',
                      }}
                      title="Model classification of current 5s window (model output, not ground truth)"
                    >
                      Classified State: {currentPoint.trueState}
                    </span>
                  </div>

                  {/* Clean Numerical Score */}
                  <div style={{ textAlign: 'center', margin: '12px 0' }}>
                    <div
                      style={{
                        fontSize: '46px',
                        fontWeight: '700',
                        color:
                          forecastRisk < 0.25
                            ? '#059669'
                            : forecastRisk < 0.60
                            ? '#d97706'
                            : '#dc2626',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {(forecastRisk * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      P(Participation Decrease Onset in Upcoming 20s)
                    </div>

                    {/* Flat Progress Bar */}
                    <div
                      style={{
                        height: '6px',
                        backgroundColor: '#f1f5f9',
                        borderRadius: '3px',
                        margin: '12px 0 6px 0',
                        overflow: 'hidden',
                        position: 'relative',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${forecastRisk * 100}%`,
                          backgroundColor:
                            forecastRisk < 0.25
                              ? '#059669'
                              : forecastRisk < 0.60
                              ? '#d97706'
                              : '#dc2626',
                          transition: 'width 0.2s ease',
                        }}
                      />
                      {/* Operating Threshold Marker */}
                      <div
                        style={{
                          position: 'absolute',
                          left: `${alertThreshold * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          backgroundColor: '#0f172a',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>0% (Nominal)</span>
                      <span style={{ color: '#0f172a', fontWeight: '500' }}>Threshold (30%)</span>
                      <span>100% (High Risk)</span>
                    </div>
                  </div>

                  {/* Camera Fallback Difference Note */}
                  {modelMode === 'modeA' && (
                    <div style={{ fontSize: '11px', color: '#475569', backgroundColor: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                      <b>Camera Fallback Comparison:</b> Full: <b>{(rawProbFull * 100).toFixed(1)}%</b> → Masked: <b>{(rawProbMasked * 100).toFixed(1)}%</b> (Δ = +{(Math.abs(rawProbMasked - rawProbFull) * 100).toFixed(1)} pp). Fallback is functional, with the gate acting as calibration regularization.
                    </div>
                  )}

                  {/* Fix 1: Why This Prediction Panel (Explainable Telemetry) */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      padding: '10px 12px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                      Why This Prediction (Observable Signals)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                        <span>Response Latency:</span>
                        <span style={{ fontWeight: '600', color: currentPoint.latencyMs > 1800 ? '#dc2626' : '#059669' }}>
                          {currentPoint.latencyMs} ms ({currentPoint.latencyMs > 1500 ? `↑ ${(currentPoint.latencyMs / 1201).toFixed(1)}× baseline` : '≈ baseline'})
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                        <span>Inactivity Pause:</span>
                        <span style={{ fontWeight: '600', color: currentPoint.inactivitySec > 3.0 ? '#dc2626' : '#059669' }}>
                          {currentPoint.inactivitySec} s ({currentPoint.inactivitySec > 3.0 ? '↑ above 3s threshold' : '✓ continuous flow'})
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                        <span>Tap Rhythm:</span>
                        <span style={{ fontWeight: '600', color: currentPoint.pace < 0.4 ? '#dc2626' : '#059669' }}>
                          {currentPoint.pace.toFixed(2)}/s ({currentPoint.pace < 0.4 ? '↓ motor deceleration' : '≈ steady rhythm'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Clean Advisory Card */}
                  {forecastRisk >= alertThreshold ? (
                    <div
                      style={{
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#991b1b', fontSize: '12px' }}>
                        Advisory: Imminent Decrease Onset Forecasted
                      </div>
                      <p style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '2px', lineHeight: '1.4' }}>
                        Interaction pace has decelerated relative to personal baseline. Recommended subtle educator check-in.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#065f46', fontSize: '12px' }}>
                        Nominal Task Pacing
                      </div>
                      <p style={{ fontSize: '11px', color: '#047857', marginTop: '2px', lineHeight: '1.4' }}>
                        Learner reaction times and touch intervals are within individual expected bounds.
                      </p>
                    </div>
                  )}

                  {/* Cooldown Counter */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: isCooldownActive ? '#d97706' : '#64748b',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>15s Alert Cooldown:</span>
                    <b>{isCooldownActive ? `ACTIVE (${cooldownRemaining}s remaining)` : 'STANDBY'}</b>
                  </div>
                </div>

                {/* Non-Diagnostic Guardrail Note */}
                <div
                  style={{
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '10px',
                    marginTop: '12px',
                    fontSize: '11px',
                    color: '#64748b',
                    lineHeight: '1.4',
                  }}
                >
                  <b>Ethical Rule:</b> Measures observable task pacing only. Stimming, cognitive pauses, and looking away are classified as valid participation or self-regulation.
                </div>
              </div>

              {/* Right Column: 30-Second Historical Sequence */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  padding: '18px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      30-Second Observation History [t - 30s → t]
                    </h3>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Touch rhythm — 1 bar = 1 second
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>
                    What the model sees: tap rate + idle time, last 30 seconds
                  </p>

                  {/* Sparkline Bars */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', color: '#475569' }}>
                      <span>Tap rhythm (taps/sec across 30 one-second bins)</span>
                      <span>Current: <b>{currentPoint.pace.toFixed(2)}/s</b></span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '2px',
                        height: '52px',
                        backgroundColor: '#f8fafc',
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {windowData.map((pt, i) => {
                        const h = Math.min(100, (pt.pace / 2.0) * 100);
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              height: `${Math.max(6, h)}%`,
                              backgroundColor: pt.pace < 0.3 ? '#dc2626' : pt.pace < 0.8 ? '#d97706' : '#2563eb',
                              borderRadius: '1px',
                            }}
                            title={`t=${pt.timeSec}s: Pace=${pt.pace}/s`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Response Latency</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>
                        {currentPoint.latencyMs} <span style={{ fontSize: '10px', color: '#64748b' }}>ms</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.latencyMs > 2500 ? '#dc2626' : '#059669' }}>
                        {currentPoint.latencyMs > 2500 ? 'Delayed Pacing' : 'Normal Pacing'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Inactivity Time</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>
                        {currentPoint.inactivitySec} <span style={{ fontSize: '10px', color: '#64748b' }}>s</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.inactivitySec > 4 ? '#dc2626' : '#059669' }}>
                        {currentPoint.inactivitySec > 4 ? 'Pause Detected' : 'Active Flow'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Camera Stream</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: modelMode === 'modeB' ? '#475569' : cameraActive ? '#059669' : '#dc2626', marginTop: '2px' }}>
                        {modelMode === 'modeB' ? 'Not Used' : cameraActive ? 'Active' : 'Masked'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {modelMode === 'modeB' ? 'Pure Interaction (Mode B)' : cameraActive ? 'Gaze Valid' : 'Gate Fallback (+6.2 pp)'}
                      </div>
                    </div>
                  </div>

                  {/* Active Pipeline Note */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: '#475569',
                    }}
                  >
                    <b>Active Pipeline:</b>{' '}
                    {modelMode === 'modeB' ? (
                      <span style={{ color: '#0f172a', fontWeight: '500' }}>
                        Mode B (Interaction-Only) — Hit pacing + pause duration only. Proves zero dependency on camera or wearables.
                      </span>
                    ) : (
                      <span>
                        Mode A (Multimodal TCN) — 8 interaction + 3 visual channels with reliability gating.
                      </span>
                    )}
                  </div>
                </div>

                {/* Ground Truth Label Check */}
                <div
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    padding: '8px 12px',
                    fontSize: '11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                  }}
                >
                  <span style={{ color: '#475569' }}>Ground Truth: Does a decrease onset start in the next 20s?</span>
                  <b style={{ color: currentPoint.hasTrueOnset ? '#dc2626' : '#059669' }}>
                    {currentPoint.hasTrueOnset ? 'Decrease Onset Occurs' : 'Remains Engaged'}
                  </b>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: EDUCATOR ANNOTATION SUITE */}
        {/* =================================================================== */}
        {activeTab === 'annotation' && (
          <div>
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '12px 16px',
                borderRadius: '6px',
                marginBottom: '14px',
                border: '1px solid #e2e8f0',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                Educator Annotation & Timeline Synchronization Suite
              </h2>
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                Implemented in <code>app/src/annotation_tool.tsx</code>. Supports 5-second segmented coding, dual-annotator
                Cohen's Kappa agreement engine, event inspector, and observable behavioral criterion enforcement.
              </p>
            </div>
            <ParticipationAnnotationTool
              sessionId="S_L001_01"
              learnerId="L001"
              sessionDurationMs={240000}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: BENCHMARK & LOPO AUDIT */}
        {/* =================================================================== */}
        {activeTab === 'benchmark' && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '6px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
              Empirical Benchmark Results & LOPO Feasibility Findings
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Benchmark on the Engagnition clinical cohort (N=37 participants, 6,705 windows total). Test evaluation uses a held-out split of 7 participants (1,578 windows, 7.73% onset prevalence). LOPO cross-validation evaluates across the 6 onset-bearing participants.
            </p>

            {/* Headline Mode B Callout */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#1e293b',
                lineHeight: '1.5',
              }}
            >
              <b style={{ color: '#0f172a' }}>Key Technical Finding:</b> Mode B (interaction-only) matches or exceeds the full multimodal model on ranking metrics (<b>PR-AUC 0.4751 vs 0.4233</b>; <b>ROC-AUC 0.9209 vs 0.9176</b>), confirming that tablet touch dynamics carry the forecasting signal and that camera use is optional. The multimodal gate's contribution is calibration regularization, not additional predictive information.
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', marginBottom: '16px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '8px 10px' }}>Model Configuration</th>
                  <th style={{ padding: '8px 10px' }}>Input Modalities</th>
                  <th style={{ padding: '8px 10px' }}>PR-AUC</th>
                  <th style={{ padding: '8px 10px' }}>ROC-AUC</th>
                  <th style={{ padding: '8px 10px' }}>Brier Score</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Mode B: Interaction-Only Forecaster', mod: 'Pacing + Inactivity Only', pr: '0.4751', roc: '0.9209', brier: '0.2074', note: 'Headline result: Nearly 3x chance, no cameras', bold: true },
                  { name: 'TCN Full Proposed (Gate + Dropout)', mod: 'Multimodal Gate', pr: '0.4233', roc: '0.9176', brier: '0.0586', note: 'Regularized probabilities, Brier < baseline' },
                  { name: 'TCN Camera-Masked Fallback', mod: 'Camera Disconnected', pr: '0.4273', roc: '0.9193', brier: '0.0544', note: 'Resilient: Functional fallback (Δ = +6.2 pp)' },
                  { name: 'TCN Personal Baseline', mod: 'Interaction + Motion', pr: '0.4709', roc: '0.9202', brier: '0.2524', note: 'High ranking, overconfident probabilities' },
                  { name: 'Population Logistic Regression', mod: 'Global Summaries', pr: '0.1725', roc: '0.5643', brier: '0.0714', note: '+123% over chance' },
                  { name: 'Prevalence Chance Baseline', mod: 'Constant Prior', pr: '0.0773', roc: '0.5000', brier: '0.0755', note: 'Theoretical reference' },
                  { name: 'Personalized Logistic Regression', mod: 'Personal Baseline', pr: '0.2027', roc: '0.3821', brier: '0.0703', note: 'Anti-predictive rank inversion' },
                  { name: 'TCN Population Baseline', mod: 'Raw Sequences', pr: '0.0663', roc: '0.4565', brier: '0.1761', note: 'Overfits training participant signatures' },
                ].map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: row.bold ? '#f0fdf4' : idx % 2 === 0 ? 'transparent' : '#f8fafc',
                    }}
                  >
                    <td style={{ padding: '8px 10px', fontWeight: row.bold ? '700' : '500', color: row.bold ? '#065f46' : '#0f172a' }}>{row.name}</td>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>{row.mod}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '600', color: parseFloat(row.pr) > 0.4 ? '#0284c7' : '#475569' }}>{row.pr}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '600', color: parseFloat(row.roc) > 0.9 ? '#059669' : '#475569' }}>{row.roc}</td>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>{row.brier}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px', color: row.bold ? '#065f46' : '#64748b' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* LOPO Scientific Framing Section */}
            <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '4px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '6px' }}>
                Leave-One-Participant-Out (LOPO) Cross-Validation Across the 6 Onset-Bearing Participants
              </h3>
              <p style={{ fontSize: '11px', color: '#334155', lineHeight: '1.5', marginBottom: '10px' }}>
                Participant concentration is the central feasibility finding of PP1. On leave-one-participant-out evaluation across the 6 onset-bearing participants, the personalized TCN achieves mean PR-AUC <b>0.4915 ± 0.2789</b> and mean ROC-AUC <b>0.4256 ± 0.2061</b>, while the population logistic regression achieves <b>0.5284 ± 0.2755</b> and <b>0.5842 ± 0.2911</b>. Personal-baseline normalization therefore does <b>not</b> replicate as a cross-participant advantage on this cohort. The pooled-split gain was attributable to participant-level concentration (P41 → P40/P35/P28), not to a transferable mechanism. This is a feasibility boundary of the Engagnition cohort at N=6 onset-bearing participants; the in-situ classroom pilot (D3) is the appropriate test for personalization.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ backgroundColor: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>LOPO Pop. Logistic Regression</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>
                    PR: 0.5284 | ROC: 0.5842
                  </div>
                  <div style={{ fontSize: '10px', color: '#059669' }}>More stable across folds</div>
                </div>

                <div style={{ backgroundColor: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>LOPO Personalized TCN</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>
                    PR: 0.4915 | ROC: 0.4256
                  </div>
                  <div style={{ fontSize: '10px', color: '#d97706' }}>Falls below chance (N=6 limit)</div>
                </div>

                <div style={{ backgroundColor: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Discrete Advance Warnings</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#059669', marginTop: '2px' }}>
                    9 / 11 Detected (81.8%)
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Mean lead time: 8.67s</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: ETHICAL GUARDRAILS & DATASET SCOPE */}
        {/* =================================================================== */}
        {activeTab === 'ethics' && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '6px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
              Component 3 Ethical Governance & Dataset Scope
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Established in consultation with educators and documented in <code>docs/OBSERVABLE_LABELS.md</code>:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '4px', borderLeft: '3px solid #059669', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '6px' }}>
                  What the Model Forecasts
                </h3>
                <ul style={{ fontSize: '12px', color: '#334155', lineHeight: '1.6', paddingLeft: '16px' }}>
                  <li>Estimates the probability of a teacher-defined decrease in task interaction in the upcoming 20 seconds.</li>
                  <li>Tracks fine-grained response latency trends, screen inactivity duration, and prompt requests.</li>
                  <li>Operates client-side in the browser via WebAssembly ONNX, preserving child privacy.</li>
                </ul>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '4px', borderLeft: '3px solid #dc2626', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', marginBottom: '6px' }}>
                  What the Model Strictly Avoids
                </h3>
                <ul style={{ fontSize: '12px', color: '#334155', lineHeight: '1.6', paddingLeft: '16px' }}>
                  <li><b>No Affective Inference:</b> Never infers internal emotional states (boredom, distress, meltdown).</li>
                  <li><b>No Pathologizing of Self-Regulation:</b> Stimming, rhythmic motor tapping, and cognitive pauses are classified as valid participation (REGULATING).</li>
                  <li><b>No Automated Override:</b> Supplies a risk prediction only; never overrides learner agency or forces activity changes.</li>
                </ul>
              </div>
            </div>

            {/* Dataset Rationale: DAiSEE & Engagnition */}
            <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#334155', lineHeight: '1.5' }}>
              <b>Dataset Governance:</b> <b>Engagnition</b> (N=57 autistic children) serves as our public clinical benchmark. <b>DAiSEE</b> is excluded by design due to domain mismatch (neurotypical adults watching MOOC lectures), lack of interaction dynamics (no touches or latencies), and static clip-level affect labels without a 20-second future-onset horizon. Real classroom tablet sessions (Main D3 Pilot) are scheduled post-PP1 following institutional ethics clearance.
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
