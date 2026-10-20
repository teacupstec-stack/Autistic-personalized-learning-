import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { SessionEventLogger, type InteractionEvent } from './event_logger';
import { StudentQuestionActivity } from './StudentQuestionActivity';
import { toSessionEvents } from './services/eventMapping';
import {
  extractCausalWindow,
  DEFAULT_DEMO_BASELINE,
  type PersonalBaselineStats,
} from './services/eventFeatureAdapter';
import {
  predictParticipationDecrease,
} from './services/forecastClient';
import {
  updateAlertState,
  createInitialAlertState,
  acknowledgeAlert,
  type AlertState,
} from './services/alertEngine';
import {
  type ForecastResult,
  type TeacherReviewEpisode,
} from './types/participation';

// ---------------------------------------------------------------------------
// Utility: format seconds as m:ss
// ---------------------------------------------------------------------------
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Utility: risk level display based on relative disengagement risk percentage
// ---------------------------------------------------------------------------
function getRiskLevel(percent: number): { label: string; color: string; bg: string; border: string } {
  if (percent >= 50) return { label: 'High', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' };
  if (percent >= 30) return { label: 'Elevated', color: '#92400e', bg: '#fffbeb', border: '#fde68a' };
  return { label: 'Low', color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' };
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'activity' | 'log' | 'about'>('activity');

  // ---------------------------------------------------------------------------
  // SESSION STATE
  // ---------------------------------------------------------------------------
  const [logger] = useState<SessionEventLogger>(() => new SessionEventLogger({
    learner_id: 'L001',
    session_id: 'S_LIVE_01',
    activity_id: 'math_number_patterns',
  }));

  const [liveEvents, setLiveEvents] = useState<InteractionEvent[]>([]);
  const [liveSec, setLiveSec] = useState<number>(0);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [isSessionPaused, setIsSessionPaused] = useState<boolean>(false);
  const [liveBaseline] = useState<PersonalBaselineStats>(DEFAULT_DEMO_BASELINE);

  const [liveForecast, setLiveForecast] = useState<ForecastResult | null>(null);
  const [liveAlertState, setLiveAlertState] = useState<AlertState>(createInitialAlertState());
  const [liveReviewEpisodes, setLiveReviewEpisodes] = useState<TeacherReviewEpisode[]>([]);
  const [selectedReviewEpisode, setSelectedReviewEpisode] = useState<TeacherReviewEpisode | null>(null);
  const [liveRiskHistory, setLiveRiskHistory] = useState<{ sec: number; risk: number | null }[]>([]);
  const [teacherActionLogged, setTeacherActionLogged] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Teacher Support Action States (Connected directly to Student View)
  // ---------------------------------------------------------------------------
  const [activeBreak, setActiveBreak] = useState<{ remainingSec: number } | null>(null);
  const [teacherSentHint, setTeacherSentHint] = useState<boolean>(false);
  const [easierQuestionRequested, setEasierQuestionRequested] = useState<boolean>(false);

  // Ref to always have fresh state inside the timer callback
  const liveEventsRef = useRef(liveEvents);
  liveEventsRef.current = liveEvents;

  const liveSecRef = useRef(liveSec);
  liveSecRef.current = liveSec;

  const liveBaselineRef = useRef(liveBaseline);
  liveBaselineRef.current = liveBaseline;

  const activeBreakRef = useRef(activeBreak);
  activeBreakRef.current = activeBreak;

  const isSessionPausedRef = useRef(isSessionPaused);
  isSessionPausedRef.current = isSessionPaused;

  // Start session on mount
  useEffect(() => {
    logger.startSession();
  }, [logger]);

  // Handle active 2-minute break countdown timer
  useEffect(() => {
    if (!activeBreak || isSessionPaused) return;

    const breakTimer = setInterval(() => {
      setActiveBreak((prev) => {
        if (!prev) return null;
        if (prev.remainingSec <= 1) {
          const resEvt = logger.logExplicitPause('resume');
          setLiveEvents((events) => [...events, resEvt]);
          setTeacherActionLogged('Break completed — Alex resumed learning refreshed');
          return null;
        }
        return { remainingSec: prev.remainingSec - 1 };
      });
    }, 1000);

    return () => clearInterval(breakTimer);
  }, [activeBreak, isSessionPaused, logger]);

  // ---------------------------------------------------------------------------
  // Relative Risk Calculation (Starts from 0%, drops to 0% when active)
  // ---------------------------------------------------------------------------
  const displayRiskPercent = useMemo(() => {
    if (liveSec < 10 || !liveForecast || liveForecast.risk_probability === null) {
      return 0; // Starts from 0% cleanly
    }
    // Baseline model logit gives ~0.039 when fully active.
    // Calibrate relative to active baseline so 0% = active engagement:
    const rawRisk = liveForecast.risk_probability;
    const excess = Math.max(0, (rawRisk - 0.039) / (1.0 - 0.039));
    return Math.min(100, Math.round(excess * 100));
  }, [liveSec, liveForecast]);

  const riskLevel = getRiskLevel(displayRiskPercent);

  // ---------------------------------------------------------------------------
  // CORE: Run continuous inference for current timestamp
  // ---------------------------------------------------------------------------
  const runInference = useCallback(async (currentSec: number) => {
    // If student is in an active calming break or session paused, keep risk at 0%
    if (activeBreakRef.current || isSessionPausedRef.current) {
      setLiveRiskHistory((hist) => [
        ...hist.slice(-59),
        { sec: currentSec, risk: 0 },
      ]);
      return;
    }

    const sessionEvts = toSessionEvents(liveEventsRef.current);
    const windowData = extractCausalWindow(sessionEvts, currentSec, 30, liveBaselineRef.current);

    const forecast = await predictParticipationDecrease({
      sessionId: 'S_LIVE_01',
      timestampSec: currentSec,
      windowData,
      inputMode: 'interactive_session',
      alertThreshold: 0.30,
    });

    setLiveForecast(forecast);

    // Compute relative risk for history graph
    const rawRisk = forecast.risk_probability;
    const relRisk = rawRisk !== null ? Math.max(0, (rawRisk - 0.039) / (1.0 - 0.039)) : 0;

    setLiveRiskHistory((hist) => [
      ...hist.slice(-59),
      { sec: currentSec, risk: currentSec < 10 ? 0 : relRisk },
    ]);

    // Update alert state machine based on calibrated risk
    setLiveAlertState((prevAlert) => {
      const nextAlert = updateAlertState(
        prevAlert,
        relRisk,
        currentSec,
        forecast.prediction_status === 'valid',
        { threshold: 0.30, consecutivePredictions: 3, cooldownSec: 10 }
      );

      // Trigger review episode when entering advisory
      // NO automatic modal popup! Options modal opens only when teacher clicks "Review & Decide"
      if (nextAlert.status === 'advisory_active' && prevAlert.status !== 'advisory_active') {
        const newEpisode: TeacherReviewEpisode = {
          id: `ep_${currentSec}`,
          triggerTimeSec: currentSec,
          triggerRisk: relRisk,
          peakRisk: relRisk,
          triggerLatencyMs: windowData.snapshot.mean_response_latency_ms ?? 0,
          triggerInactivitySec: windowData.snapshot.inactivity_sec,
          status: 'pending',
          evidenceSummary: [...forecast.evidence],
        };
        setLiveReviewEpisodes((eps) => [newEpisode, ...eps]);
      } else if (relRisk >= 0.30) {
        // Update peak risk for active pending episode
        setLiveReviewEpisodes((eps) =>
          eps.map((ep) =>
            ep.status === 'pending'
              ? { ...ep, peakRisk: Math.max(ep.peakRisk ?? 0, relRisk) }
              : ep
          )
        );
      }

      return nextAlert;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // 1 Hz CONTINUOUS INFERENCE TIMER — pauses when session paused
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isLiveActive || isSessionPaused) return;

    const interval = setInterval(() => {
      setLiveSec((prev) => {
        const nextSec = prev + 1;
        runInference(nextSec);
        return nextSec;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLiveActive, isSessionPaused, runInference]);

  // ---------------------------------------------------------------------------
  // REACTIVE: Re-run inference immediately when student interacts
  // ---------------------------------------------------------------------------
  const handleStudentEventLogged = useCallback((evt: InteractionEvent, allEvents: InteractionEvent[]) => {
    if (isSessionPausedRef.current) return;

    setLiveEvents([...allEvents]);
    liveEventsRef.current = [...allEvents];

    // Immediate re-inference with current time to drop risk immediately
    const currentSec = liveSecRef.current;
    if (currentSec >= 10) {
      setTimeout(() => runInference(currentSec), 150);
    }
  }, [runInference]);

  // ---------------------------------------------------------------------------
  // SESSION PAUSE & RESUME LOGIC
  // ---------------------------------------------------------------------------
  const handleToggleSessionPause = () => {
    if (!isSessionPaused) {
      setIsSessionPaused(true);
      const pauseEvt = logger.logExplicitPause('pause');
      setLiveEvents((prev) => [...prev, pauseEvt]);
      setTeacherActionLogged('Session paused by educator');
    } else {
      setIsSessionPaused(false);
      const resumeEvt = logger.logExplicitPause('resume');
      setLiveEvents((prev) => [...prev, resumeEvt]);
      setTeacherActionLogged('Session resumed — continuous monitoring active');
      // Trigger instant update on resume
      runInference(liveSecRef.current);
    }
  };

  // ---------------------------------------------------------------------------
  // TEACHER SUPPORT ACTIONS LOGIC (Real Implementation)
  // ---------------------------------------------------------------------------

  // Internal episode acknowledgement
  const markEpisodeAcknowledged = (episodeId: string | undefined, actionLabel: string) => {
    if (episodeId) {
      setLiveReviewEpisodes((eps) =>
        eps.map((ep) =>
          ep.id === episodeId
            ? {
                ...ep,
                status: 'reviewed' as const,
                acknowledgedAt: liveSec,
                teacherAction: actionLabel,
              }
            : ep
        )
      );
    }
    // Enter 12-second observation cooldown so student has space to engage
    setLiveAlertState((prev) => acknowledgeAlert(prev, liveSec));
    setSelectedReviewEpisode(null);
  };

  // 1. 🌿 Offer a 2-minute break
  const handleOfferBreak = (episodeId?: string) => {
    setActiveBreak({ remainingSec: 120 });
    const pauseEvt = logger.logExplicitPause('pause');
    setLiveEvents((prev) => [...prev, pauseEvt]);
    markEpisodeAcknowledged(episodeId, 'Offered 2-minute break');
    setTeacherActionLogged('Offered 2-minute calming break to Alex');
  };

  // Student completes or resumes early from break
  const handleResumeFromBreak = () => {
    setActiveBreak(null);
    const resumeEvt = logger.logExplicitPause('resume');
    setLiveEvents((prev) => [...prev, resumeEvt]);
    setTeacherActionLogged('Alex resumed learning refreshed');
    runInference(liveSecRef.current);
  };

  // 2. 🧩 Switch to an easier question
  const handleSwitchEasierQuestion = (episodeId?: string) => {
    setEasierQuestionRequested(true);
    const switchEvt = logger.logPrompt('hint_delivered', 'easier_pattern_scaffold');
    setLiveEvents((prev) => [...prev, switchEvt]);
    markEpisodeAcknowledged(episodeId, 'Switched to easier question');
    setTeacherActionLogged('Switched to easier math pattern for Alex');
    runInference(liveSecRef.current);
  };

  // 3. 💡 Send a hint
  const handleSendHint = (episodeId?: string) => {
    setTeacherSentHint(true);
    const hintEvt = logger.logPrompt('hint_delivered', 'teacher_sent_hint');
    setLiveEvents((prev) => [...prev, hintEvt]);
    markEpisodeAcknowledged(episodeId, 'Sent a hint');
    setTeacherActionLogged('Sent pedagogical pattern hint to Alex');
    runInference(liveSecRef.current);
  };

  // 4. ✓ Alex is just thinking — continue
  const handleConfirmThinking = (episodeId?: string) => {
    const thinkEvt = logger.logExplicitPause('pause');
    setLiveEvents((prev) => [...prev, thinkEvt]);
    markEpisodeAcknowledged(episodeId, 'Alex is just thinking — continue');
    setTeacherActionLogged('Confirmed thinking pause — monitoring quietly without interruption');
  };

  // Restart session
  const handleRestartLiveSession = () => {
    logger.startSession();
    setLiveEvents([]);
    liveEventsRef.current = [];
    setLiveSec(0);
    liveSecRef.current = 0;
    setLiveForecast(null);
    setLiveAlertState(createInitialAlertState());
    setLiveRiskHistory([]);
    setLiveReviewEpisodes([]);
    setTeacherActionLogged(null);
    setActiveBreak(null);
    setTeacherSentHint(false);
    setEasierQuestionRequested(false);
    setSelectedReviewEpisode(null);
    setIsSessionPaused(false);
  };

  // Active pending review episode
  const activePendingEpisode = liveReviewEpisodes.find((ep) => ep.status === 'pending') || null;

  // Computed live inactivity
  const inactivitySec = useMemo(() => {
    if (activeBreak || isSessionPaused) return 0; // Paused during break or educator pause
    if (liveEvents.length === 0) return liveSec;
    const lastEvtMs = liveEvents[liveEvents.length - 1].time_ms;
    return Math.max(0, parseFloat((liveSec - lastEvtMs / 1000).toFixed(1)));
  }, [liveEvents, liveSec, activeBreak, isSessionPaused]);

  // Recent action count in 30s window
  const recentEventCount = useMemo(() => {
    const cutoff = Math.max(0, (liveSec - 30) * 1000);
    return liveEvents.filter((e) => e.time_ms >= cutoff).length;
  }, [liveEvents, liveSec]);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🌱</span>
            <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              Personalised Learning Assistant
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#047857',
                background: '#d1fae5',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              Mode B • Continuous Monitoring
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            Camera-free participation monitoring for neurodiverse learners
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
          {[
            { id: 'activity', label: 'Learning Activity' },
            { id: 'log', label: `Review Log (${liveReviewEpisodes.length})` },
            { id: 'about', label: 'About' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === tab.id ? '#ffffff' : 'transparent',
                color: activeTab === tab.id ? '#0f172a' : '#64748b',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Session Status, Pause/Resume & Restart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Session time: <strong>{fmtTime(liveSec)}</strong>
          </div>

          {isSessionPaused && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#b45309',
                background: '#fef3c7',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid #fde68a',
              }}
            >
              ⏸️ PAUSED
            </span>
          )}

          <button
            onClick={handleToggleSessionPause}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: isSessionPaused ? '1px solid #16a34a' : '1px solid #ca8a04',
              background: isSessionPaused ? '#f0fdf4' : '#fefce8',
              color: isSessionPaused ? '#166534' : '#854d0e',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSessionPaused ? '▶️ Resume Session' : '⏸️ Pause Session'}
          </button>

          <button
            onClick={handleRestartLiveSession}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Restart Session 🔄
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* ================================================================ */}
        {/* TAB 1: LEARNING ACTIVITY (Student View + Teacher Live Monitor)    */}
        {/* ================================================================ */}
        {activeTab === 'activity' && (
          <div>
            {/* Banner: Attention Alert for Teacher (Opens modal ONLY on clicking 'Review & Decide') */}
            {activePendingEpisode && !selectedReviewEpisode && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  marginBottom: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.08)',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>
                    Attention — Alex may need support
                  </div>
                  <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '2px' }}>
                    Idle time: {activePendingEpisode.triggerInactivitySec}s without interaction · Risk level {Math.round((activePendingEpisode.peakRisk ?? 0.35) * 100)}%
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedReviewEpisode(activePendingEpisode)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Review & Decide
                  </button>
                  <button
                    onClick={() => handleConfirmThinking(activePendingEpisode.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#991b1b',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Just Thinking
                  </button>
                </div>
              </div>
            )}

            {/* Teacher Action Logged Notification Banner */}
            {teacherActionLogged && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                  color: '#166534',
                }}
              >
                <span>✓ <strong>{teacherActionLogged}</strong> — continuous monitoring active</span>
                <button
                  onClick={() => setTeacherActionLogged(null)}
                  style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Dual View Layout: Left Student Screen | Right Teacher Monitor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', alignItems: 'start' }}>
              {/* LEFT: Student Tablet Screen */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '18px' }}>📱</span>
                  <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Student View (Alex's Screen)</h2>
                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    Zero student-facing alarms
                  </span>
                </div>

                <StudentQuestionActivity
                  logger={logger}
                  onEventLogged={handleStudentEventLogged}
                  learnerName="Alex"
                  learnerId="L001"
                  isSessionPaused={isSessionPaused}
                  activeBreak={activeBreak}
                  onResumeFromBreak={handleResumeFromBreak}
                  teacherSentHint={teacherSentHint}
                  onClearTeacherHint={() => setTeacherSentHint(false)}
                  easierQuestionRequested={easierQuestionRequested}
                  onEasierQuestionApplied={() => setEasierQuestionRequested(false)}
                />
              </div>

              {/* RIGHT: Teacher Live Monitor Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Participation Risk Card (Starts from 0%, drops to 0% on active interaction) */}
                <div
                  style={{
                    backgroundColor: riskLevel.bg,
                    border: `1px solid ${riskLevel.border}`,
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                        Participation Risk
                      </div>
                      <div style={{ fontSize: '11px', color: riskLevel.color, fontWeight: 600, marginTop: '2px' }}>
                        {riskLevel.label} risk · Threshold at 30%
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '32px', fontWeight: 900, color: riskLevel.color }}>
                        {displayRiskPercent}%
                      </span>
                      {liveSec < 10 && (
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          Baseline ({liveSec}/10s)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ height: '8px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: `${displayRiskPercent}%`,
                        height: '100%',
                        backgroundColor: riskLevel.color,
                        transition: 'width 0.3s ease',
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>

                {/* Live Activity Telemetry */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Live Activity
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Idle Time</div>
                      <div style={{
                        fontSize: '20px',
                        fontWeight: 800,
                        color: inactivitySec > 15 ? '#dc2626' : inactivitySec > 8 ? '#d97706' : '#059669',
                        marginTop: '2px',
                      }}>
                        {inactivitySec}s
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Recent Actions</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>
                        {recentEventCount}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>last 30s</div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total Events</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                        {liveEvents.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evidence Panel */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    What the system observes
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.7 }}>
                    {(liveForecast?.evidence || ['Evaluating student interaction telemetry…']).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Teacher Support Options */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>
                    Support Options
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => handleOfferBreak(activePendingEpisode?.id)}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      🌿 Offer a Break
                    </button>
                    <button
                      onClick={() => handleSwitchEasierQuestion(activePendingEpisode?.id)}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      🧩 Easier Question
                    </button>
                    <button
                      onClick={() => handleSendHint(activePendingEpisode?.id)}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      💡 Send a Hint
                    </button>
                    <button
                      onClick={() => handleConfirmThinking(activePendingEpisode?.id)}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      ✓ Just Thinking
                    </button>
                  </div>
                </div>

                {/* Risk History Sparkline */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Risk Over Time</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Dashed line = 30% advisory threshold</div>
                  </div>
                  <div
                    style={{
                      height: '50px',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '2px',
                      padding: '4px 6px',
                    }}
                  >
                    {/* 30% threshold line */}
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '30%', borderBottom: '1px dashed #f87171', zIndex: 1 }} />
                    {liveRiskHistory.slice(-40).map((item, idx) => {
                      const h = item.risk !== null ? Math.max(3, Math.round(item.risk * 100 * 0.45)) : 2;
                      const elevated = item.risk !== null && item.risk >= 0.30;
                      return (
                        <div
                          key={idx}
                          title={`t=${item.sec}s: ${item.risk !== null ? Math.round(item.risk * 100) + '%' : '0%'}`}
                          style={{
                            flex: 1,
                            height: `${h}px`,
                            backgroundColor: elevated ? '#dc2626' : '#0284c7',
                            borderRadius: '2px',
                            zIndex: 2,
                            transition: 'height 0.3s ease',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: REVIEW LOG                                               */}
        {/* ================================================================ */}
        {activeTab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>
                Educator Advisory Log
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
                Every advisory generated by the continuous participation forecaster is logged here.
              </p>

              {liveReviewEpisodes.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No advisories recorded yet. Monitoring is running continuously.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {liveReviewEpisodes.map((ep) => (
                    <div
                      key={ep.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: ep.status === 'pending' ? '#fffbeb' : '#f8fafc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          Advisory at {fmtTime(ep.triggerTimeSec)} — Risk {Math.round((ep.peakRisk ?? ep.triggerRisk) * 100)}%
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Idle time: {ep.triggerInactivitySec}s · Status: <strong>{ep.status.toUpperCase()}</strong>
                          {ep.teacherAction && ` · Action: ${ep.teacherAction}`}
                        </div>
                      </div>

                      {ep.status === 'pending' && (
                        <button
                          onClick={() => setSelectedReviewEpisode(ep)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Review & Decide
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: ABOUT                                                    */}
        {/* ================================================================ */}
        {activeTab === 'about' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0' }}>
                How This Works
              </h2>
              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                This tool helps teachers support students during learning activities. It observes
                how the student interacts with the task — answer pacing, idle pauses, and activity density —
                and estimates whether participation might decrease soon. If it notices a sustained pause (idle &gt; 15s),
                it quietly alerts the teacher so they can choose the best pedagogical support response.
                The student's screen is never interrupted with alarms.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px 0' }}>
                  No Camera Required
                </h3>
                <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  The system works entirely from task interaction data — touch timing and response
                  patterns. No webcam or video recording is used.
                </p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px 0' }}>
                  Student-Safe Design
                </h3>
                <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Alerts and risk indicators are only shown to the teacher. The student
                  never sees alarms, warnings, or popups. Self-regulation pauses ("I'm thinking")
                  are respected and excluded from hesitation metrics.
                </p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px 0' }}>
                  Teacher Makes the Decision
                </h3>
                <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  The system suggests that a student may need support but never acts autonomously.
                  The teacher reviews the evidence and chooses: a gentle break, an easier question,
                  a hint, or allowing Alex cognitive space to think.
                </p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px 0' }}>
                  Continuous Monitoring
                </h3>
                <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Inference runs continuously throughout the session. If the student interacts,
                  the risk drops immediately to 0%. If inactivity persists, an advisory is triggered.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================================================================ */}
      {/* REVIEW EPISODE MODAL (Alex May Need Support)                      */}
      {/* Opens ONLY when teacher clicks 'Review & Decide'                 */}
      {/* ================================================================ */}
      {selectedReviewEpisode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
            }}
          >
            {/* Modal Title & Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🌱</span>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Alex May Need Support
                </h3>
              </div>
              <button
                onClick={() => setSelectedReviewEpisode(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Episode Summary Card */}
            <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                <strong>When:</strong> {fmtTime(selectedReviewEpisode.triggerTimeSec)} into the session<br />
                <strong>Idle time:</strong> {selectedReviewEpisode.triggerInactivitySec} seconds without interaction<br />
                <strong>Risk level:</strong> {Math.round((selectedReviewEpisode.peakRisk ?? selectedReviewEpisode.triggerRisk) * 100)}%
              </div>

              {selectedReviewEpisode.evidenceSummary && selectedReviewEpisode.evidenceSummary.length > 0 && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                  {selectedReviewEpisode.evidenceSummary.map((e, i) => (
                    <div key={i} style={{ marginTop: '2px' }}>• {e}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Question to Teacher */}
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
              What would you like to do?
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              <button
                onClick={() => handleOfferBreak(selectedReviewEpisode.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span>🌿</span> Offer a 2-minute break
              </button>

              <button
                onClick={() => handleSwitchEasierQuestion(selectedReviewEpisode.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span>🧩</span> Switch to an easier question
              </button>

              <button
                onClick={() => handleSendHint(selectedReviewEpisode.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span>💡</span> Send a hint
              </button>

              <button
                onClick={() => handleConfirmThinking(selectedReviewEpisode.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span>✓</span> Alex is just thinking — continue
              </button>
            </div>

            {/* Modal Bottom Close */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedReviewEpisode(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
