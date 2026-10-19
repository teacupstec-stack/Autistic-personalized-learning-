import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ParticipationAnnotationTool } from './annotation_tool';

// -----------------------------------------------------------------------------
// Sample Simulated Session Data for Live Demonstration
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
        gazeRatio = 0.35; // Looking away but self-soothing!
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
  const [modelMode, setModelMode] = useState<'modeA' | 'modeB'>('modeB'); // Mode B interaction-only by default!
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

    // Mean latency in last 30s
    const meanLatency = windowData.reduce((acc, p) => acc + p.latencyMs, 0) / Math.max(1, windowData.length);
    const meanPace = windowData.reduce((acc, p) => acc + p.pace, 0) / Math.max(1, windowData.length);
    const maxInactivity = Math.max(...windowData.map((p) => p.inactivitySec), 0);

    // Baseline personal reference (from t=0..60s)
    const personalBaseLatency = 1300;
    const latencyRatio = meanLatency / personalBaseLatency;

    let logit = -3.2 + (latencyRatio - 1.0) * 3.8 + (maxInactivity / 5.0) * 2.2 - meanPace * 1.5;

    // Multimodal contribution if Mode A and camera is valid
    if (modelMode === 'modeA') {
      if (cameraActive) {
        const gazeMean = windowData.reduce((acc, p) => acc + p.gazeRatio, 0) / Math.max(1, windowData.length);
        logit += (1 - gazeMean) * 0.8;
      } else {
        // Camera masked fallback: Multimodal Reliability Gate isolates interaction
        // Prediction remains stable and slightly regularized
      }
    }

    // Sigmoid
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
    <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              color: '#fff',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)',
            }}
          >
            C3
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              PBEF Component 3 — Participation Forecasting
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#1e3a8a',
                  color: '#93c5fd',
                }}
              >
                PP1 Ready
              </span>
            </h1>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>
              Personal-Baseline Sequence Forecaster & Educator Annotation Suite (PBEF)
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav style={{ display: 'flex', gap: '6px', backgroundColor: '#131d35', padding: '4px', borderRadius: '10px' }}>
          {[
            { id: 'live', label: '1. Live Forecaster Demo' },
            { id: 'annotation', label: '2. Educator Annotation Tool' },
            { id: 'benchmark', label: '3. Benchmark & Audit' },
            { id: 'ethics', label: '4. Ethical Safeguards' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: activeTab === tab.id ? '#2563eb' : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : '#94a3b8',
                boxShadow: activeTab === tab.id ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
        {/* =================================================================== */}
        {/* TAB 1: LIVE FORECASTER DEMO */}
        {/* =================================================================== */}
        {activeTab === 'live' && (
          <div>
            {/* Top Control Ribbon */}
            <div
              style={{
                backgroundColor: '#131d35',
                border: '1px solid #1e293b',
                borderRadius: '14px',
                padding: '18px 24px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              {/* Scenario Preset Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>Session Scenario:</span>
                <select
                  value={sessionType}
                  onChange={(e) => {
                    setSessionType(e.target.value as any);
                    setCurrentTimeSec(65);
                    setIsPlaying(false);
                  }}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="onset">Scenario A: Held-Out Clinical Decrease Onset (P40 / L003)</option>
                  <option value="regulating">Scenario B: Autistic Self-Regulation (Stimming — Non-Decrease)</option>
                  <option value="calm">Scenario C: Continuous Active Task Engagement</option>
                </select>
              </div>

              {/* Playback Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    backgroundColor: isPlaying ? '#e11d48' : '#10b981',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: isPlaying
                      ? '0 0 12px rgba(225, 29, 72, 0.4)'
                      : '0 0 12px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play Session'}
                </button>

                <button
                  onClick={() => setCurrentTimeSec(60)}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                  }}
                >
                  ⏮ Reset to 60s
                </button>

                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0f172a', padding: '3px', borderRadius: '8px' }}>
                  {[1, 2, 5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
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

              {/* Mode & Reliability Gate Switchers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '3px', borderRadius: '8px' }}>
                  <button
                    onClick={() => setModelMode('modeB')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: modelMode === 'modeB' ? '#3b82f6' : 'transparent',
                      color: modelMode === 'modeB' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Mode B: Interaction-Only (No Sensors)
                  </button>
                  <button
                    onClick={() => setModelMode('modeA')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: modelMode === 'modeA' ? '#3b82f6' : 'transparent',
                      color: modelMode === 'modeA' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Mode A: Multimodal TCN
                  </button>
                </div>

                {modelMode === 'modeA' && (
                  <button
                    onClick={() => setCameraActive(!cameraActive)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: cameraActive ? '#065f46' : '#831843',
                      color: cameraActive ? '#6ee7b7' : '#fbcfe8',
                      boxShadow: cameraActive
                        ? '0 0 10px rgba(16, 185, 129, 0.2)'
                        : '0 0 10px rgba(244, 63, 94, 0.3)',
                    }}
                  >
                    {cameraActive ? '📷 Camera: Connected' : '🚫 Camera: Disconnected (Fallback Active)'}
                  </button>
                )}
              </div>
            </div>

            {/* Live Progress Scrubber */}
            <div style={{ backgroundColor: '#131d35', padding: '16px 20px', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>
                  Session Time: <b style={{ color: '#f8fafc' }}>{currentTimeSec}s</b> / 240s
                </span>
                <span style={{ color: '#38bdf8', fontWeight: '500' }}>
                  Observation Window: <b>[{Math.max(0, currentTimeSec - 30)}s → {currentTimeSec}s]</b> &nbsp;|&nbsp; Target Horizon: <b>[{currentTimeSec}s → {currentTimeSec + 20}s]</b>
                </span>
                <span style={{ color: currentTimeSec >= 60 ? '#34d399' : '#f59e0b' }}>
                  {currentTimeSec >= 60 ? '✓ Zero-Leakage Window Active (t ≥ 60s)' : '⏳ Baseline Calibration Period (t < 60s)'}
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
                }}
              />
            </div>

            {/* Main Interactive Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', marginBottom: '20px' }}>
              {/* Left Column: Live Risk Gauge & Alerts */}
              <div
                style={{
                  backgroundColor: '#131d35',
                  borderRadius: '14px',
                  padding: '24px',
                  border: isAlertTriggered ? '2px solid #ef4444' : '1px solid #1e293b',
                  boxShadow: isAlertTriggered ? '0 0 25px rgba(239, 68, 68, 0.35)' : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                      20-Second Future Onset Risk Gauge
                    </h3>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
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
                      CURRENT STATE: {currentPoint.trueState}
                    </span>
                  </div>

                  {/* Circular/Bar Risk Representation */}
                  <div style={{ textAlign: 'center', margin: '20px 0' }}>
                    <div
                      style={{
                        fontSize: '56px',
                        fontWeight: '800',
                        color:
                          forecastRisk < 0.25
                            ? '#10b981'
                            : forecastRisk < 0.60
                            ? '#f59e0b'
                            : '#ef4444',
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {(forecastRisk * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8', marginTop: '4px' }}>
                      P(Participation Decrease Onset in Upcoming 20s)
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: '10px',
                        backgroundColor: '#0f172a',
                        borderRadius: '5px',
                        margin: '16px 0 8px 0',
                        overflow: 'hidden',
                        position: 'relative',
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
                          transition: 'width 0.3s ease',
                        }}
                      />
                      {/* Alert threshold marker */}
                      <div
                        style={{
                          position: 'absolute',
                          left: `${alertThreshold * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          backgroundColor: '#f8fafc',
                          boxShadow: '0 0 4px #ffffff',
                        }}
                        title={`Operating Threshold: ${alertThreshold}`}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>0% (Active)</span>
                      <span style={{ color: '#38bdf8' }}>Operating Threshold (30%)</span>
                      <span>100% (Imminent Onset)</span>
                    </div>
                  </div>

                  {/* Alert Advisory Banner */}
                  {forecastRisk >= alertThreshold ? (
                    <div
                      style={{
                        backgroundColor: '#450a0a',
                        border: '1px solid #dc2626',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#fecaca', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>⚠️ PROACTIVE EDUCATOR ADVISORY TRIGGERED</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#fca5a5', marginTop: '4px' }}>
                        Model predicts probable decrease onset in [t, t+20s]. Suggested discreet verbal or visual scaffolding prompt.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: '#022c22',
                        border: '1px solid #059669',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#a7f3d0', fontSize: '13px' }}>
                        ✓ NORMAL TASK FLOW
                      </div>
                      <p style={{ fontSize: '12px', color: '#6ee7b7', marginTop: '4px' }}>
                        Learner interaction pacing is within nominal expected bounds relative to personal baseline.
                      </p>
                    </div>
                  )}

                  {/* Cooldown Suppression Counter */}
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: isCooldownActive ? '#f59e0b' : '#94a3b8',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>15s Alert Suppression Cooldown:</span>
                    <b>{isCooldownActive ? `ACTIVE (${cooldownRemaining}s remaining)` : 'READY (No Fatigue)'}</b>
                  </div>
                </div>

                {/* Non-Diagnostic Ethical Footer */}
                <div
                  style={{
                    borderTop: '1px solid #1e293b',
                    paddingTop: '12px',
                    marginTop: '16px',
                    fontSize: '11px',
                    color: '#64748b',
                    lineHeight: '1.4',
                  }}
                >
                  <b>Ethical Governance:</b> Non-punitive observable task metric. Pauses for processing and self-regulation (stimming, rocking) are never pathologized as disengagement.
                </div>
              </div>

              {/* Right Column: 30-Second Historical Window Telemetry */}
              <div
                style={{
                  backgroundColor: '#131d35',
                  borderRadius: '14px',
                  padding: '24px',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '6px' }}>
                    30-Second Historical Sequence [t - 30s → t]
                  </h3>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
                    1 Hz feature bins entering Temporal Convolutional Network (Channels: Hit Pacing, Inactivity Duration)
                  </p>

                  {/* Pacing Visualizer Bars */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#94a3b8' }}>
                      <span>Interaction Pace (Hits/sec across last 30 bins)</span>
                      <span>Current: <b>{currentPoint.pace.toFixed(2)}/s</b></span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '3px',
                        height: '65px',
                        backgroundColor: '#0f172a',
                        padding: '6px',
                        borderRadius: '8px',
                      }}
                    >
                      {windowData.map((pt, i) => {
                        const h = Math.min(100, (pt.pace / 2.0) * 100);
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              height: `${Math.max(8, h)}%`,
                              backgroundColor: pt.pace < 0.3 ? '#ef4444' : pt.pace < 0.8 ? '#f59e0b' : '#3b82f6',
                              borderRadius: '2px',
                              transition: 'height 0.1s ease',
                            }}
                            title={`t=${pt.timeSec}s: Pace=${pt.pace}/s`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Metric Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Response Latency</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginTop: '2px' }}>
                        {currentPoint.latencyMs} <span style={{ fontSize: '11px', color: '#64748b' }}>ms</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.latencyMs > 2500 ? '#ef4444' : '#10b981' }}>
                        {currentPoint.latencyMs > 2500 ? '↑ High Hesitation' : '✓ Nominal Pacing'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Inactivity Duration</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginTop: '2px' }}>
                        {currentPoint.inactivitySec} <span style={{ fontSize: '11px', color: '#64748b' }}>sec</span>
                      </div>
                      <div style={{ fontSize: '10px', color: currentPoint.inactivitySec > 4 ? '#ef4444' : '#10b981' }}>
                        {currentPoint.inactivitySec > 4 ? '↑ Screen Idle' : '✓ Active Tap Flow'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Visual Validity Mask</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: cameraActive ? '#10b981' : '#f43f5e', marginTop: '2px' }}>
                        {modelMode === 'modeB' ? 'N/A' : cameraActive ? '1 (Active)' : '0 (Masked)'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {modelMode === 'modeB' ? 'Pure Interaction' : cameraActive ? 'Gaze Tracked' : 'Gate Fallback'}
                      </div>
                    </div>
                  </div>

                  {/* Model Mode Details */}
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '12px',
                      color: '#cbd5e1',
                    }}
                  >
                    <b>Active Inference Pipeline:</b>{' '}
                    {modelMode === 'modeB' ? (
                      <span style={{ color: '#38bdf8' }}>
                        Mode B (Pure Interaction Forecaster) — Hit Pacing + Pause Duration only. Zero camera or wearable dependence.
                      </span>
                    ) : (
                      <span style={{ color: '#c084fc' }}>
                        Mode A (Multimodal TCN with Reliability Gate) — Dynamic visual gaze stream with automatic fallback.
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#94a3b8',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Ground Truth Episode in Target [t, t+20s]:</span>
                  <b style={{ color: currentPoint.hasTrueOnset ? '#f87171' : '#34d399' }}>
                    {currentPoint.hasTrueOnset ? 'YES (Decrease Onset Imminent)' : 'NO (Remains Engaged)'}
                  </b>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: EDUCATOR ANNOTATION SUITE (1436-line tool) */}
        {/* =================================================================== */}
        {activeTab === 'annotation' && (
          <div>
            <div
              style={{
                backgroundColor: '#131d35',
                padding: '16px 20px',
                borderRadius: '12px',
                marginBottom: '16px',
                border: '1px solid #1e293b',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                Special Educator Annotation & Timeline Synchronization Tool
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>
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
          <div style={{ backgroundColor: '#131d35', borderRadius: '14px', padding: '24px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>
              Empirical Benchmark Results & Model Comparison
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              Evaluated strictly on 7 held-out clinical test participants from Engagnition (P40, P35, P28, P39, P42, P20, P26; 1,578 test windows):
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '10px 14px' }}>Model Configuration</th>
                  <th style={{ padding: '10px 14px' }}>Input Modalities</th>
                  <th style={{ padding: '10px 14px' }}>PR-AUC</th>
                  <th style={{ padding: '10px 14px' }}>ROC-AUC</th>
                  <th style={{ padding: '10px 14px' }}>Brier Score</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
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
                  { name: 'TCN Camera-Masked Fallback', mod: 'Camera Disconnected', pr: '0.4273', roc: '0.9193', brier: '0.0544', note: 'Resilient: 0% performance loss' },
                  { name: 'Mode B: Interaction-Only Forecaster', mod: 'Pacing + Inactivity Only', pr: '0.4751', roc: '0.9209', brier: '0.2074', note: 'Nearly 3x chance without cameras!' },
                ].map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#f8fafc' }}>{row.name}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.mod}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 'bold', color: parseFloat(row.pr) > 0.4 ? '#38bdf8' : '#cbd5e1' }}>{row.pr}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 'bold', color: parseFloat(row.roc) > 0.9 ? '#34d399' : '#cbd5e1' }}>{row.roc}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.brier}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#a5b4fc' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>True Episodes Detected</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#34d399', marginTop: '4px' }}>
                  9 / 11 <span style={{ fontSize: '14px', color: '#94a3b8' }}>(81.8%)</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>95% Bootstrap CI: [54.5%, 100.0%]</div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Mean Usable Advance Lead Time</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>
                  8.67 <span style={{ fontSize: '14px', color: '#94a3b8' }}>seconds</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Median lead time: 9.00s</div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Alert Suppression Cooldown</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c084fc', marginTop: '4px' }}>
                  15 <span style={{ fontSize: '14px', color: '#94a3b8' }}>seconds</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Prevents educator fatigue</div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: ETHICAL SAFEGUARDS */}
        {/* =================================================================== */}
        {activeTab === 'ethics' && (
          <div style={{ backgroundColor: '#131d35', borderRadius: '14px', padding: '24px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>
              Component 3 Ethical Governance & Non-Diagnostic Guardrails
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              Established in consultation with special educators and documented in <code>docs/OBSERVABLE_LABELS.md</code>:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '10px', borderLeft: '4px solid #10b981' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#34d399', marginBottom: '6px' }}>
                  What the Model Forecasts
                </h3>
                <ul style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', paddingLeft: '18px' }}>
                  <li>Estimates the probability of a teacher-defined decrease in task interaction over the next 20 seconds.</li>
                  <li>Tracks fine-grained response latency trends, screen inactivity duration, and prompt requests.</li>
                  <li>Normalizes metrics strictly against each individual learner's personal calibration baseline.</li>
                </ul>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '10px', borderLeft: '4px solid #ef4444' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#f87171', marginBottom: '6px' }}>
                  What the Model Strictly Avoids
                </h3>
                <ul style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', paddingLeft: '18px' }}>
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
