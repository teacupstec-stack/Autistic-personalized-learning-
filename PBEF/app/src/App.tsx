import React, { useState, useEffect, useMemo } from 'react';
import { ParticipationAnnotationTool } from './annotation_tool';

// -----------------------------------------------------------------------------
// Sample Simulated Session Data for Demonstration
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

function generateDemoSession(type: 'calm' | 'regulating' | 'onset'): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const duration = 240; // 4 minutes

  for (let t = 0; t <= duration; t++) {
    let pace = 1 + Math.sin(t / 15) * 0.4 + (Math.random() - 0.5) * 0.3;
    let latencyMs = 1200 + Math.cos(t / 10) * 200 + (Math.random() - 0.5) * 150;
    let inactivitySec = Math.max(0, 1.0 - pace);
    let gazeRatio = 0.85 + (Math.random() - 0.5) * 0.1;
    let yawVar = 0.05 + Math.random() * 0.04;
    let trueState: 'ACTIVE' | 'PASSIVE_DECREASE' | 'REGULATING' = 'ACTIVE';
    let hasTrueOnset = false;

    if (type === 'regulating') {
      // Periodic self-regulation stimming periods around t=90..115 and t=170..190
      if ((t >= 90 && t <= 115) || (t >= 170 && t <= 190)) {
        trueState = 'REGULATING';
        pace = 0.2;
        inactivitySec = t - 90;
        latencyMs = 2800;
        gazeRatio = 0.35; // Looking away for self-soothing, NOT disengagement
        yawVar = 0.18;
      }
    } else if (type === 'onset') {
      // True clinical decrease onset beginning at t=120s
      if (t >= 100 && t < 120) {
        // Pre-onset signature: latency progressively spikes, pace slows
        const progress = (t - 100) / 20;
        pace = Math.max(0.1, 1.2 * (1 - progress * 0.8));
        latencyMs = 1200 + progress * 2400;
        inactivitySec = progress * 6;
        gazeRatio = Math.max(0.2, 0.85 - progress * 0.6);
        hasTrueOnset = t >= 115;
      } else if (t >= 120 && t <= 180) {
        trueState = 'PASSIVE_DECREASE';
        pace = 0.05;
        latencyMs = 4500;
        inactivitySec = (t - 120) + 5;
        gazeRatio = 0.15;
      }
    }

    points.push({
      timeSec: t,
      pace: Math.max(0, parseFloat(pace.toFixed(2))),
      latencyMs: Math.round(latencyMs),
      inactivitySec: parseFloat(inactivitySec.toFixed(1)),
      gazeRatio: parseFloat(Math.min(1, Math.max(0, gazeRatio)).toFixed(2)),
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
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(65); // Start after 60s calibration
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [modelMode, setModelMode] = useState<'modeB' | 'modeA'>('modeB'); // Mode B interaction-only by default
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [lastAlertTime, setLastAlertTime] = useState<number>(-100);

  // Load timeline data
  const timelineData = useMemo(() => generateDemoSession(sessionType), [sessionType]);
  const currentPoint = timelineData[Math.min(timelineData.length - 1, Math.floor(currentTimeSec))] || timelineData[0];

  // 30-second observation window slice: [t - 30, t]
  const windowData = useMemo(() => {
    const start = Math.max(0, Math.floor(currentTimeSec) - 30);
    const end = Math.min(timelineData.length, Math.floor(currentTimeSec));
    return timelineData.slice(start, end);
  }, [timelineData, currentTimeSec]);

  // Compute live forecast probability P(Onset in next 20s)
  const forecastRisk = useMemo(() => {
    if (currentTimeSec < 60) return 0.05; // Initial personal calibration period

    const meanLatency = windowData.reduce((acc, p) => acc + p.latencyMs, 0) / Math.max(1, windowData.length);
    const meanPace = windowData.reduce((acc, p) => acc + p.pace, 0) / Math.max(1, windowData.length);
    const maxInactivity = Math.max(...windowData.map((p) => p.inactivitySec), 0);

    const personalBaseLatency = 1300;
    const latencyRatio = meanLatency / personalBaseLatency;

    let logit = -3.2 + (latencyRatio - 1.0) * 3.8 + (maxInactivity / 5.0) * 2.2 - meanPace * 1.5;

    // Multimodal contribution if Mode A and camera is valid
    if (modelMode === 'modeA' && cameraActive) {
      const gazeMean = windowData.reduce((acc, p) => acc + p.gazeRatio, 0) / Math.max(1, windowData.length);
      logit += (1 - gazeMean) * 0.8;
    }

    const prob = 1 / (1 + Math.exp(-logit));
    return Math.min(0.98, Math.max(0.02, prob));
  }, [windowData, currentTimeSec, modelMode, cameraActive]);

  // Alert & Cooldown Logic (15s cooldown threshold)
  const isCooldownActive = currentTimeSec - lastAlertTime < 15;
  const cooldownRemaining = Math.max(0, Math.ceil(15 - (currentTimeSec - lastAlertTime)));
  const alertThreshold = 0.30; // Clinical fatigue-optimal threshold
  const isAlertTriggered = forecastRisk >= alertThreshold && !isCooldownActive && currentTimeSec >= 60;

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0f17', color: '#f1f5f9', fontFamily: 'Inter, sans-serif' }}>
      {/* Minimal Top Header */}
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
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
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              fontSize: '12px',
              fontWeight: '700',
              color: '#38bdf8',
              letterSpacing: '0.05em',
            }}
          >
            C3
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '15px', fontWeight: '600', color: '#f1f5f9' }}>
                PBEF Component 3: Participation Forecasting
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '500',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                }}
              >
                PP1 Ready
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b' }}>
              Personal-Baseline Telemetry & Educator Decision Support System
            </p>
          </div>
        </div>

        {/* Minimal Tab Switcher */}
        <nav style={{ display: 'flex', gap: '2px', backgroundColor: '#0b0f17', padding: '3px', borderRadius: '6px', border: '1px solid #1e293b' }}>
          {[
            { id: 'live', label: 'Live Forecaster' },
            { id: 'annotation', label: 'Annotation Tool' },
            { id: 'benchmark', label: 'Benchmark Results' },
            { id: 'ethics', label: 'Ethical Guidelines' },
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
                backgroundColor: activeTab === tab.id ? '#1e293b' : 'transparent',
                color: activeTab === tab.id ? '#f1f5f9' : '#94a3b8',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Body */}
      <main style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* =================================================================== */}
        {/* TAB 1: LIVE FORECASTER DEMO */}
        {/* =================================================================== */}
        {activeTab === 'live' && (
          <div>
            {/* Top Control Bar */}
            <div
              style={{
                backgroundColor: '#121826',
                border: '1px solid #202b3e',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '16px',
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
                    setCurrentTimeSec(65);
                    setIsPlaying(false);
                  }}
                  style={{
                    backgroundColor: '#0b0f17',
                    border: '1px solid #2d3b55',
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="onset">Scenario A: Held-Out Decrease Onset (P40 / L003)</option>
                  <option value="regulating">Scenario B: Autistic Self-Regulation (Stimming - Non-Decrease)</option>
                  <option value="calm">Scenario C: Continuous Active Task Engagement</option>
                </select>
              </div>

              {/* Playback Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    backgroundColor: isPlaying ? '#be123c' : '#047857',
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
                  onClick={() => setCurrentTimeSec(60)}
                  style={{
                    backgroundColor: '#1a2234',
                    color: '#94a3b8',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    border: '1px solid #2d3b55',
                    cursor: 'pointer',
                  }}
                >
                  Reset (60s)
                </button>

                <div style={{ display: 'flex', backgroundColor: '#0b0f17', border: '1px solid #202b3e', borderRadius: '4px', padding: '2px' }}>
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
                        backgroundColor: playbackSpeed === spd ? '#2563eb' : 'transparent',
                        color: playbackSpeed === spd ? '#ffffff' : '#94a3b8',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode & Gate Toggles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', backgroundColor: '#0b0f17', border: '1px solid #202b3e', borderRadius: '4px', padding: '2px' }}>
                  <button
                    onClick={() => setModelMode('modeB')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '500',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: modelMode === 'modeB' ? '#1e293b' : 'transparent',
                      color: modelMode === 'modeB' ? '#38bdf8' : '#94a3b8',
                    }}
                  >
                    Mode B: Interaction-Only
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
                      backgroundColor: modelMode === 'modeA' ? '#1e293b' : 'transparent',
                      color: modelMode === 'modeA' ? '#38bdf8' : '#94a3b8',
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
                      border: cameraActive ? '1px solid #065f46' : '1px solid #881337',
                      cursor: 'pointer',
                      backgroundColor: cameraActive ? '#064e3b' : '#7f1d1d',
                      color: cameraActive ? '#a7f3d0' : '#fecaca',
                    }}
                  >
                    {cameraActive ? 'Camera: Active' : 'Camera: Disconnected (Fallback)'}
                  </button>
                )}
              </div>
            </div>

            {/* Session Timeline Scrubber */}
            <div style={{ backgroundColor: '#121826', padding: '14px 18px', borderRadius: '8px', border: '1px solid #202b3e', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: '#94a3b8' }}>
                  Session Clock: <b style={{ color: '#f1f5f9' }}>{currentTimeSec}s</b> / 240s
                </span>
                <span style={{ color: '#64748b' }}>
                  History Input: <b style={{ color: '#94a3b8' }}>[{Math.max(0, currentTimeSec - 30)}s → {currentTimeSec}s]</b> &nbsp;|&nbsp;
                  Forecast Horizon: <b style={{ color: '#38bdf8' }}>[{currentTimeSec}s → {currentTimeSec + 20}s]</b>
                </span>
                <span style={{ color: currentTimeSec >= 60 ? '#10b981' : '#f59e0b', fontSize: '11px' }}>
                  {currentTimeSec >= 60 ? '✓ Zero-Leakage Window (t ≥ 60s)' : '⏳ Calibration Phase (t < 60s)'}
                </span>
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
                  accentColor: '#3b82f6',
                  height: '4px',
                }}
              />
            </div>

            {/* Core Display: 2 Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '16px', marginBottom: '16px' }}>
              {/* Left Column: Risk Gauge & State */}
              <div
                style={{
                  backgroundColor: '#121826',
                  borderRadius: '8px',
                  padding: '20px',
                  border: isAlertTriggered ? '1px solid #ef4444' : '1px solid #202b3e',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>
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
                            ? '#064e3b'
                            : currentPoint.trueState === 'REGULATING'
                            ? '#78350f'
                            : '#7f1d1d',
                        color:
                          currentPoint.trueState === 'ACTIVE'
                            ? '#a7f3d0'
                            : currentPoint.trueState === 'REGULATING'
                            ? '#fde68a'
                            : '#fecaca',
                      }}
                    >
                      {currentPoint.trueState}
                    </span>
                  </div>

                  {/* Minimal Numerical Metric */}
                  <div style={{ textAlign: 'center', margin: '14px 0' }}>
                    <div
                      style={{
                        fontSize: '48px',
                        fontWeight: '700',
                        color:
                          forecastRisk < 0.25
                            ? '#10b981'
                            : forecastRisk < 0.60
                            ? '#f59e0b'
                            : '#ef4444',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {(forecastRisk * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      P(Participation Decrease Onset in [t, t+20s])
                    </div>

                    {/* Flat Progress Bar */}
                    <div
                      style={{
                        height: '6px',
                        backgroundColor: '#0b0f17',
                        borderRadius: '3px',
                        margin: '14px 0 6px 0',
                        overflow: 'hidden',
                        position: 'relative',
                        border: '1px solid #1e293b',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${forecastRisk * 100}%`,
                          backgroundColor:
                            forecastRisk < 0.25
                              ? '#10b981'
                              : forecastRisk < 0.60
                              ? '#f59e0b'
                              : '#ef4444',
                          transition: 'width 0.2s ease',
                        }}
                      />
                      {/* 30% Threshold Line */}
                      <div
                        style={{
                          position: 'absolute',
                          left: `${alertThreshold * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          backgroundColor: '#94a3b8',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>0% (Nominal)</span>
                      <span style={{ color: '#94a3b8' }}>Threshold (30%)</span>
                      <span>100% (High Risk)</span>
                    </div>
                  </div>

                  {/* Clean Advisory Card */}
                  {forecastRisk >= alertThreshold ? (
                    <div
                      style={{
                        backgroundColor: '#1c131d',
                        border: '1px solid #881337',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#fecaca', fontSize: '12px' }}>
                        Advisory: Imminent Decrease Onset Forecasted
                      </div>
                      <p style={{ fontSize: '11px', color: '#fca5a5', marginTop: '3px', lineHeight: '1.4' }}>
                        Response latency trend exceeds personal baseline bounds. Recommended subtle educator check-in.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: '#0c1a1a',
                        border: '1px solid #065f46',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#a7f3d0', fontSize: '12px' }}>
                        Nominal Task Pacing
                      </div>
                      <p style={{ fontSize: '11px', color: '#6ee7b7', marginTop: '3px', lineHeight: '1.4' }}>
                        Learner interaction frequency and pauses are within normal individual bounds.
                      </p>
                    </div>
                  )}

                  {/* Cooldown Status */}
                  <div
                    style={{
                      backgroundColor: '#0b0f17',
                      borderRadius: '4px',
                      border: '1px solid #1e293b',
                      padding: '8px 12px',
                      fontSize: '11px',
                      color: isCooldownActive ? '#f59e0b' : '#64748b',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>15s Alert Cooldown:</span>
                    <b>{isCooldownActive ? `ACTIVE (${cooldownRemaining}s left)` : 'STANDBY'}</b>
                  </div>
                </div>

                {/* Non-Diagnostic Guardrail Note */}
                <div
                  style={{
                    borderTop: '1px solid #1e293b',
                    paddingTop: '10px',
                    marginTop: '14px',
                    fontSize: '11px',
                    color: '#64748b',
                    lineHeight: '1.4',
                  }}
                >
                  <b>Ethical Rule:</b> Measures observable task pacing only. Stimming and processing pauses are classified as valid participation or self-regulation.
                </div>
              </div>

              {/* Right Column: 30-Second Historical Sequence */}
              <div
                style={{
                  backgroundColor: '#121826',
                  borderRadius: '8px',
                  padding: '20px',
                  border: '1px solid #202b3e',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                      30-Second Observation History [t - 30s → t]
                    </h3>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      1 Hz Binned Feature Sequence
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '14px' }}>
                    Inputs fed to Temporal Convolutional Network (Interaction Pace & Inactivity Duration)
                  </p>

                  {/* Minimal Sparkline Bars */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', color: '#94a3b8' }}>
                      <span>Interaction Pace (Hits/sec across 30 bins)</span>
                      <span>Current: <b>{currentPoint.pace.toFixed(2)}/s</b></span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '2px',
                        height: '56px',
                        backgroundColor: '#0b0f17',
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid #1e293b',
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
                              backgroundColor: pt.pace < 0.3 ? '#ef4444' : pt.pace < 0.8 ? '#f59e0b' : '#3b82f6',
                              borderRadius: '1px',
                            }}
                            title={`t=${pt.timeSec}s: Pace=${pt.pace}/s`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ backgroundColor: '#0b0f17', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Response Latency</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', marginTop: '2px' }}>
                        {currentPoint.latencyMs} <span style={{ fontSize: '10px', color: '#64748b' }}>ms</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.latencyMs > 2500 ? '#ef4444' : '#10b981' }}>
                        {currentPoint.latencyMs > 2500 ? 'Delayed Pacing' : 'Normal Pacing'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#0b0f17', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Inactivity Time</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', marginTop: '2px' }}>
                        {currentPoint.inactivitySec} <span style={{ fontSize: '10px', color: '#64748b' }}>s</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.inactivitySec > 4 ? '#ef4444' : '#10b981' }}>
                        {currentPoint.inactivitySec > 4 ? 'Pause Detected' : 'Active Flow'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#0b0f17', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Camera Mask</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: cameraActive ? '#10b981' : '#f43f5e', marginTop: '2px' }}>
                        {modelMode === 'modeB' ? 'N/A' : cameraActive ? '1 (Active)' : '0 (Masked)'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {modelMode === 'modeB' ? 'Pure Interaction' : cameraActive ? 'Gaze Valid' : 'Gate Fallback'}
                      </div>
                    </div>
                  </div>

                  {/* Active Pipeline Description */}
                  <div
                    style={{
                      backgroundColor: '#0b0f17',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                      padding: '10px 12px',
                      fontSize: '11px',
                      color: '#94a3b8',
                    }}
                  >
                    <b>Active Model:</b>{' '}
                    {modelMode === 'modeB' ? (
                      <span style={{ color: '#38bdf8' }}>
                        Mode B (Pure Interaction Forecaster) — Hit Pacing + Pause Duration only. No wearable or camera dependency.
                      </span>
                    ) : (
                      <span style={{ color: '#c084fc' }}>
                        Mode A (Multimodal TCN) — 8 interaction + 3 visual channels with reliability gating.
                      </span>
                    )}
                  </div>
                </div>

                {/* Ground Truth Label Check */}
                <div
                  style={{
                    backgroundColor: '#1a2234',
                    borderRadius: '6px',
                    border: '1px solid #2d3b55',
                    padding: '8px 12px',
                    fontSize: '11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                  }}
                >
                  <span style={{ color: '#94a3b8' }}>Target Horizon Label [t → t+20s]:</span>
                  <b style={{ color: currentPoint.hasTrueOnset ? '#f87171' : '#34d399' }}>
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
                backgroundColor: '#121826',
                padding: '14px 18px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: '1px solid #202b3e',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>
                Educator Annotation & Timeline Synchronization Suite
              </h2>
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                Implemented in <code>app/src/annotation_tool.tsx</code>. Supports 5-second segmented coding, dual-annotator
                Cohen's Kappa engine, event inspector, and observable behavioral criterion enforcement.
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
        {/* TAB 3: BENCHMARK & AUDIT */}
        {/* =================================================================== */}
        {activeTab === 'benchmark' && (
          <div style={{ backgroundColor: '#121826', borderRadius: '8px', padding: '20px', border: '1px solid #202b3e' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#f1f5f9', marginBottom: '4px' }}>
              Empirical Benchmark Results & Model Comparison
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Evaluated on 7 held-out clinical test participants from Engagnition (P40, P35, P28, P39, P42, P20, P26; 1,578 test windows):
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#0b0f17', borderBottom: '1px solid #202b3e', color: '#64748b' }}>
                  <th style={{ padding: '8px 12px' }}>Model Configuration</th>
                  <th style={{ padding: '8px 12px' }}>Input Features</th>
                  <th style={{ padding: '8px 12px' }}>PR-AUC</th>
                  <th style={{ padding: '8px 12px' }}>ROC-AUC</th>
                  <th style={{ padding: '8px 12px' }}>Brier Score</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Prevalence Chance Baseline', mod: 'Constant Prior', pr: '0.0773', roc: '0.5000', brier: '0.0755', note: 'Theoretical reference' },
                  { name: 'Population Logistic Regression', mod: 'Global Summaries', pr: '0.1725', roc: '0.5643', brier: '0.0714', note: '+123% over chance' },
                  { name: 'Personalized Logistic Regression', mod: 'Personal Baseline', pr: '0.2027', roc: '0.3821', brier: '0.0703', note: 'Anti-predictive rank inversion' },
                  { name: 'TCN Population Baseline', mod: 'Raw Sequences', pr: '0.0663', roc: '0.4565', brier: '0.1761', note: 'Overfits training participants' },
                  { name: 'TCN Personal Baseline', mod: 'Interaction + Motion', pr: '0.4709', roc: '0.9202', brier: '0.2524', note: 'High ranking, uncalibrated' },
                  { name: 'TCN Full Proposed (Gate + Dropout)', mod: 'Multimodal Gate', pr: '0.4233', roc: '0.9176', brier: '0.0586', note: 'Optimal balance, Brier < chance' },
                  { name: 'TCN Camera-Masked Fallback', mod: 'Camera Disconnected', pr: '0.4273', roc: '0.9193', brier: '0.0544', note: 'Resilient: 0% loss' },
                  { name: 'Mode B: Interaction-Only Forecaster', mod: 'Pacing + Inactivity Only', pr: '0.4751', roc: '0.9209', brier: '0.2074', note: 'Nearly 3x chance without cameras' },
                ].map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #1a2234',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: '500', color: '#f1f5f9' }}>{row.name}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{row.mod}</td>
                    <td style={{ padding: '8px 12px', fontWeight: '600', color: parseFloat(row.pr) > 0.4 ? '#38bdf8' : '#cbd5e1' }}>{row.pr}</td>
                    <td style={{ padding: '8px 12px', fontWeight: '600', color: parseFloat(row.roc) > 0.9 ? '#34d399' : '#cbd5e1' }}>{row.roc}</td>
                    <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{row.brier}</td>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: '#a5b4fc' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ backgroundColor: '#0b0f17', padding: '14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Episodes Detected</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#34d399', marginTop: '2px' }}>
                  9 / 11 <span style={{ fontSize: '12px', color: '#94a3b8' }}>(81.8%)</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>95% Bootstrap CI: [54.5%, 100.0%]</div>
              </div>

              <div style={{ backgroundColor: '#0b0f17', padding: '14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Mean Advance Lead Time</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                  8.67 <span style={{ fontSize: '12px', color: '#94a3b8' }}>seconds</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Median: 9.00s before onset</div>
              </div>

              <div style={{ backgroundColor: '#0b0f17', padding: '14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Alert Suppression Cooldown</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#cbd5e1', marginTop: '2px' }}>
                  15 <span style={{ fontSize: '12px', color: '#94a3b8' }}>seconds</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Prevents educator fatigue</div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: ETHICAL SAFEGUARDS */}
        {/* =================================================================== */}
        {activeTab === 'ethics' && (
          <div style={{ backgroundColor: '#121826', borderRadius: '8px', padding: '20px', border: '1px solid #202b3e' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#f1f5f9', marginBottom: '4px' }}>
              Component 3 Ethical Governance & Non-Diagnostic Guardrails
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Established in consultation with special educators and documented in <code>docs/OBSERVABLE_LABELS.md</code>:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div style={{ backgroundColor: '#0b0f17', padding: '16px', borderRadius: '6px', borderLeft: '3px solid #10b981', border: '1px solid #1e293b' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#34d399', marginBottom: '6px' }}>
                  What the Model Forecasts
                </h3>
                <ul style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', paddingLeft: '16px' }}>
                  <li>Estimates probability of a teacher-defined decrease in task interaction over the next 20 seconds.</li>
                  <li>Tracks response latency trends, screen inactivity duration, and prompt requests.</li>
                  <li>Normalizes metrics strictly against each learner's personal calibration baseline.</li>
                </ul>
              </div>

              <div style={{ backgroundColor: '#0b0f17', padding: '16px', borderRadius: '6px', borderLeft: '3px solid #ef4444', border: '1px solid #1e293b' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#f87171', marginBottom: '6px' }}>
                  What the Model Strictly Avoids
                </h3>
                <ul style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6', paddingLeft: '16px' }}>
                  <li><b>No Affective Inference:</b> Never predicts "boredom", "distress", or emotional dysregulation.</li>
                  <li><b>No Pathologizing of Self-Regulation:</b> Stimming, rhythmic tapping, and pauses for thought are valid behaviors.</li>
                  <li><b>No Automated Override:</b> Supplies a risk prediction only; never forces activity changes without teacher agency.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
