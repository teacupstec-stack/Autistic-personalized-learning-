/**
 * StudentQuestionActivity.tsx
 * ===========================
 * PBEF Component 3 — Interactive Student Question Activity (Option A)
 * 
 * Provides an authentic, learner-friendly question interface for math number patterns.
 * Captures real, timestamped interaction telemetry using SessionEventLogger:
 *  - stimulus_presented: when a question appears
 *  - answer_selected: when an option is selected (before submitting)
 *  - response: when the student submits, with active response latency & correctness
 *  - hint_requested / hint_delivered: pedagogical hint requests
 *  - idle_pause: explicit student-controlled pause ("I'm thinking") with measured duration
 *    (pause duration is deducted so thinking time is not misidentified as motor hesitation)
 * 
 * Supports teacher-initiated support actions:
 *  - 🌿 Offer a 2-minute break -> Shows gentle calming break screen with breathing prompt
 *  - 🧩 Switch to an easier question -> Replaces with accessible confidence-building pattern
 *  - 💡 Send a hint -> Automatically reveals the helpful hint card
 *  - ✓ Alex is just thinking -> Cooldown without student interruption
 * 
 * NO CAMERA required (Mode B interaction-only).
 * Zero student-facing disruption or anxiety-inducing alerts.
 */

import React, { useState, useEffect, useRef } from 'react';
import { SessionEventLogger, InteractionEvent } from './event_logger';

export interface QuestionData {
  id: string;
  pattern: string;
  sequence: string[];
  options: { id: string; label: string; value: number }[];
  correctAnswer: number;
  hint: string;
  explanation: string;
}

export const NUMBER_PATTERN_QUESTIONS: QuestionData[] = [
  {
    id: 'q1_geom',
    pattern: 'Geometric Progression (×2)',
    sequence: ['2', '4', '8', '16', '?'],
    options: [
      { id: 'opt_a', label: '24', value: 24 },
      { id: 'opt_b', label: '30', value: 30 },
      { id: 'opt_c', label: '32', value: 32 },
      { id: 'opt_d', label: '48', value: 48 },
    ],
    correctAnswer: 32,
    hint: 'Notice how each number changes: 2 × 2 = 4, 4 × 2 = 8, 8 × 2 = 16. What is 16 × 2?',
    explanation: 'Correct! Each number is doubled (multiplied by 2). 16 × 2 = 32.',
  },
  {
    id: 'q2_arith',
    pattern: 'Arithmetic Sequence (+4)',
    sequence: ['3', '7', '11', '15', '?'],
    options: [
      { id: 'opt_a', label: '18', value: 18 },
      { id: 'opt_b', label: '19', value: 19 },
      { id: 'opt_c', label: '20', value: 20 },
      { id: 'opt_d', label: '22', value: 22 },
    ],
    correctAnswer: 19,
    hint: 'Look at the step size between consecutive numbers: 7 - 3 = 4, 11 - 7 = 4. Add 4 to 15.',
    explanation: 'Correct! Each number increases by 4. 15 + 4 = 19.',
  },
  {
    id: 'q3_alt',
    pattern: 'Alternating Operations (×2, -2)',
    sequence: ['5', '10', '8', '16', '14', '?'],
    options: [
      { id: 'opt_a', label: '20', value: 20 },
      { id: 'opt_b', label: '24', value: 24 },
      { id: 'opt_c', label: '28', value: 28 },
      { id: 'opt_d', label: '30', value: 30 },
    ],
    correctAnswer: 28,
    hint: 'The pattern alternates: 5 × 2 = 10, then 10 - 2 = 8, then 8 × 2 = 16, then 16 - 2 = 14. What operation comes next?',
    explanation: 'Correct! Multiply 14 by 2 to get 28.',
  },
  {
    id: 'q4_square',
    pattern: 'Square Numbers (n²)',
    sequence: ['1', '4', '9', '16', '25', '?'],
    options: [
      { id: 'opt_a', label: '30', value: 30 },
      { id: 'opt_b', label: '34', value: 34 },
      { id: 'opt_c', label: '36', value: 36 },
      { id: 'opt_d', label: '49', value: 49 },
    ],
    correctAnswer: 36,
    hint: 'These are squares of counting numbers: 1², 2²=4, 3²=9, 4²=16, 5²=25. What is 6² (6 × 6)?',
    explanation: 'Correct! 6 × 6 = 36.',
  },
  {
    id: 'q5_fibo',
    pattern: 'Additive Progression (Sum of prior two)',
    sequence: ['2', '3', '5', '8', '13', '?'],
    options: [
      { id: 'opt_a', label: '18', value: 18 },
      { id: 'opt_b', label: '20', value: 20 },
      { id: 'opt_c', label: '21', value: 21 },
      { id: 'opt_d', label: '24', value: 24 },
    ],
    correctAnswer: 21,
    hint: 'Add the previous two numbers together: 2 + 3 = 5, 3 + 5 = 8, 5 + 8 = 13. What is 8 + 13?',
    explanation: 'Correct! 8 + 13 = 21.',
  },
];

export const EASIER_PATTERN_QUESTIONS: QuestionData[] = [
  {
    id: 'easy_q1',
    pattern: 'Counting by 2s (+2)',
    sequence: ['2', '4', '6', '8', '?'],
    options: [
      { id: 'opt_a', label: '9', value: 9 },
      { id: 'opt_b', label: '10', value: 10 },
      { id: 'opt_c', label: '11', value: 11 },
      { id: 'opt_d', label: '12', value: 12 },
    ],
    correctAnswer: 10,
    hint: 'Count up by 2 each time: 2, 4, 6, 8... 8 + 2 = ?',
    explanation: 'Great job! 8 + 2 = 10. You counted by 2s!',
  },
  {
    id: 'easy_q2',
    pattern: 'Counting by 5s (+5)',
    sequence: ['5', '10', '15', '20', '?'],
    options: [
      { id: 'opt_a', label: '22', value: 22 },
      { id: 'opt_b', label: '25', value: 25 },
      { id: 'opt_c', label: '28', value: 28 },
      { id: 'opt_d', label: '30', value: 30 },
    ],
    correctAnswer: 25,
    hint: 'Count by 5s: 5, 10, 15, 20... what comes next?',
    explanation: 'Awesome! 20 + 5 = 25. Perfect counting by 5s!',
  },
];

export interface StudentQuestionActivityProps {
  logger: SessionEventLogger;
  onEventLogged?: (event: InteractionEvent, allEvents: InteractionEvent[]) => void;
  learnerName?: string;
  learnerId?: string;
  isSessionPaused?: boolean;
  // Teacher support action signals:
  activeBreak?: { remainingSec: number } | null;
  onResumeFromBreak?: () => void;
  teacherSentHint?: boolean;
  onClearTeacherHint?: () => void;
  easierQuestionRequested?: boolean;
  onEasierQuestionApplied?: () => void;
}

export const StudentQuestionActivity: React.FC<StudentQuestionActivityProps> = ({
  logger,
  onEventLogged,
  learnerName = 'Alex',
  learnerId = 'L001',
  isSessionPaused,
  activeBreak,
  onResumeFromBreak,
  teacherSentHint,
  onClearTeacherHint,
  easierQuestionRequested,
  onEasierQuestionApplied,
}) => {
  const [questions, setQuestions] = useState<QuestionData[]>(NUMBER_PATTERN_QUESTIONS);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<{ isCorrect: boolean; text: string } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [isExplicitlyPaused, setIsExplicitlyPaused] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const [score, setScore] = useState(0);
  const [allEvents, setAllEvents] = useState<InteractionEvent[]>([]);
  const [showEventLog, setShowEventLog] = useState(false);
  const [teacherBanner, setTeacherBanner] = useState<{ type: 'hint' | 'easier'; text: string } | null>(null);

  const currentQ = questions[currentQuestionIdx] || questions[0];
  const questionStartTimeRef = useRef<number>(Date.now());
  const pauseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync internal events state
  const notifyEvent = (evt: InteractionEvent) => {
    setAllEvents((prev) => {
      const next = [...prev, evt];
      if (onEventLogged) {
        onEventLogged(evt, next);
      }
      return next;
    });
  };

  // Present question stimulus on mount or change
  useEffect(() => {
    questionStartTimeRef.current = Date.now();
    setSelectedOptionId(null);
    setIsSubmitted(false);
    setAnswerFeedback(null);
    setHintVisible(false);
    setIsExplicitlyPaused(false);
    setPauseSeconds(0);

    const stimEvt = logger.logStimulusPresented(currentQ.id);
    notifyEvent(stimEvt);
  }, [currentQuestionIdx, questions]);

  // Handle explicit pause timer
  useEffect(() => {
    if (isExplicitlyPaused) {
      pauseTimerRef.current = setInterval(() => {
        setPauseSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (pauseTimerRef.current) {
        clearInterval(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      setPauseSeconds(0);
    }
    return () => {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
    };
  }, [isExplicitlyPaused]);

  // React to Teacher Support Action: "Send a Hint"
  useEffect(() => {
    if (teacherSentHint) {
      setHintVisible(true);
      setTeacherBanner({
        type: 'hint',
        text: `💡 Your teacher sent a helpful hint: "${currentQ.hint}"`,
      });
      const delivEvt = logger.logPrompt('hint_delivered', 'teacher_sent_hint');
      notifyEvent(delivEvt);
      if (onClearTeacherHint) onClearTeacherHint();
    }
  }, [teacherSentHint, currentQ, logger, onClearTeacherHint]);

  // React to Teacher Support Action: "Switch to an easier question"
  useEffect(() => {
    if (easierQuestionRequested) {
      setQuestions(EASIER_PATTERN_QUESTIONS);
      setCurrentQuestionIdx(0);
      setSelectedOptionId(null);
      setIsSubmitted(false);
      setAnswerFeedback(null);
      setHintVisible(false);
      setTeacherBanner({
        type: 'easier',
        text: '🧩 Your teacher switched to an easier pattern to build confidence! Let\'s solve this together.',
      });
      const switchEvt = logger.logPrompt('hint_delivered', 'easier_pattern_scaffold');
      notifyEvent(switchEvt);
      if (onEasierQuestionApplied) onEasierQuestionApplied();
    }
  }, [easierQuestionRequested, logger, onEasierQuestionApplied]);

  // Handle option selection
  const handleSelectOption = (opt: { id: string; label: string; value: number }) => {
    if (isSubmitted || isExplicitlyPaused || activeBreak || isSessionPaused) return;
    setSelectedOptionId(opt.id);

    // Log answer_selected distinct from submission
    const selEvt = logger.logAnswerSelected(currentQ.id, opt.id);
    notifyEvent(selEvt);
  };

  // Handle submit answer
  const handleSubmitAnswer = () => {
    if (!selectedOptionId || isSubmitted || isExplicitlyPaused || activeBreak || isSessionPaused) return;

    const chosen = currentQ.options.find((o) => o.id === selectedOptionId);
    if (!chosen) return;

    const isCorrect = chosen.value === currentQ.correctAnswer;
    setIsSubmitted(true);

    if (isCorrect) {
      setScore((s) => s + 10);
      setAnswerFeedback({
        isCorrect: true,
        text: currentQ.explanation,
      });
    } else {
      setAnswerFeedback({
        isCorrect: false,
        text: `Not quite. You chose ${chosen.label}. Review the pattern or try requesting a hint!`,
      });
    }

    // Log response with measured active latency & correctness
    const respEvt = logger.logResponse({
      isCorrect,
      metadata: {
        question_id: currentQ.id,
        selected_option: chosen.label,
        correct_answer: currentQ.correctAnswer,
      },
    });
    notifyEvent(respEvt);
  };

  // Handle hint request
  const handleRequestHint = () => {
    if (hintVisible || isExplicitlyPaused || activeBreak) return;
    setHintVisible(true);

    const reqEvt = logger.logPrompt('hint_requested', 'pattern_guidance');
    notifyEvent(reqEvt);

    const delivEvt = logger.logPrompt('hint_delivered', 'pattern_guidance');
    notifyEvent(delivEvt);
  };

  // Handle explicit pause / resume toggle
  const handleTogglePause = () => {
    if (isSubmitted || activeBreak) return;

    if (!isExplicitlyPaused) {
      setIsExplicitlyPaused(true);
      const pauseEvt = logger.logExplicitPause('pause');
      notifyEvent(pauseEvt);
    } else {
      setIsExplicitlyPaused(false);
      const resumeEvt = logger.logExplicitPause('resume');
      notifyEvent(resumeEvt);
    }
  };

  // Advance to next question
  const handleNextQuestion = () => {
    setTeacherBanner(null);
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx((idx) => idx + 1);
    } else {
      setCurrentQuestionIdx(0);
    }
  };

  // Format seconds to mm:ss
  const fmtMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Activity Header */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎓</span>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Math Pattern Discovery
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#0369a1',
                background: '#e0f2fe',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              Grade 4 • Camera-Free Mode B
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
            Learner: <strong>{learnerName} ({learnerId})</strong> • Question {currentQuestionIdx + 1} of{' '}
            {questions.length}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              textAlign: 'right',
              padding: '6px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>SCORE</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284c7' }}>{score} pts</div>
          </div>

          <button
            onClick={handleTogglePause}
            disabled={isSubmitted || !!activeBreak}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: isExplicitlyPaused ? '1px solid #ca8a04' : '1px solid #cbd5e1',
              background: isExplicitlyPaused ? '#fefce8' : '#ffffff',
              color: isExplicitlyPaused ? '#854d0e' : '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isSubmitted || !!activeBreak ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isExplicitlyPaused ? '▶️ Resume Solving' : "⏸️ I'm Thinking (Pause)"}
          </button>
        </div>
      </div>

      {/* Teacher Action Notification Banner */}
      {teacherBanner && (
        <div
          style={{
            background: teacherBanner.type === 'hint' ? '#eff6ff' : '#f0fdf4',
            border: teacherBanner.type === 'hint' ? '1px solid #93c5fd' : '1px solid #86efac',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            color: teacherBanner.type === 'hint' ? '#1e40af' : '#166534',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <span>{teacherBanner.text}</span>
          <button
            onClick={() => setTeacherBanner(null)}
            style={{
              background: 'none',
              border: 'none',
              color: teacherBanner.type === 'hint' ? '#1d4ed8' : '#15803d',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Question Card OR 2-Minute Calming Break Screen */}
      <div
        style={{
          background: '#ffffff',
          border: isExplicitlyPaused ? '2px dashed #eab308' : '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          position: 'relative',
          minHeight: '340px',
        }}
      >
        {/* Session Paused by Educator Overlay */}
        {isSessionPaused && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255, 255, 255, 0.94)',
              borderRadius: '16px',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>⏸️</div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#334155', margin: '0 0 6px 0' }}>
              Session Paused by Teacher
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '380px', margin: 0, lineHeight: 1.5 }}>
              The activity is temporarily paused. Relax your hands and eyes until resumed.
            </p>
          </div>
        )}

        {/* 🌿 2-MINUTE CALMING BREAK SCREEN (When teacher offered break) */}
        {activeBreak ? (
          <div
            style={{
              padding: '20px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 100%)',
              borderRadius: '12px',
              border: '1px solid #a7f3d0',
            }}
          >
            <div style={{ fontSize: '46px', marginBottom: '8px' }}>🌿</div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#065f46', margin: '0 0 8px 0' }}>
              Time for a Calming 2-Minute Break
            </h2>
            <p style={{ fontSize: '14px', color: '#047857', maxWidth: '440px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Take a slow, gentle breath. Relax your hands and shoulders. You are doing fantastic work!
            </p>

            {/* Breathing Visual Indicator */}
            <div
              style={{
                width: '110px',
                height: '110px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #6ee7b7 0%, #34d399 70%, #059669 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(5, 150, 105, 0.25)',
                margin: '12px 0 20px 0',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em' }}>REST TIME</div>
              <div style={{ fontSize: '22px', fontWeight: 900 }}>{fmtMinSec(activeBreak.remainingSec)}</div>
            </div>

            <p style={{ fontSize: '12px', color: '#059669', margin: '0 0 20px 0' }}>
              Inhale gently... hold... exhale slowly.
            </p>

            <button
              onClick={onResumeFromBreak}
              style={{
                padding: '12px 28px',
                borderRadius: '10px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 3px 8px rgba(5, 150, 105, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🌿</span> I'm Ready to Continue Learning
            </button>
          </div>
        ) : (
          <>
            {/* Thinking Pause Overlay if student paused to think */}
            {isExplicitlyPaused && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(255, 255, 255, 0.94)',
                  borderRadius: '16px',
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>💭</div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#854d0e', margin: '0 0 6px 0' }}>
                  Thinking Pause Active ({pauseSeconds}s)
                </h3>
                <p style={{ fontSize: '13px', color: '#713f12', maxWidth: '420px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                  Take your time to think through the pattern! This explicit pause duration is tracked as self-regulation
                  and excluded from active response latency.
                </p>
                <button
                  onClick={handleTogglePause}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#ca8a04',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(202, 138, 4, 0.3)',
                  }}
                >
                  ▶️ I'm Ready to Resume
                </button>
              </div>
            )}

            {/* Pattern Concept Tag */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  background: '#f1f5f9',
                  padding: '4px 10px',
                  borderRadius: '6px',
                }}
              >
                Pattern Rule: {currentQ.pattern}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Select an answer, then click Submit
              </span>
            </div>

            {/* Question Prompt */}
            <h3 style={{ fontSize: '19px', fontWeight: 700, color: '#0f172a', margin: '0 0 20px 0' }}>
              What is the missing number in this sequence?
            </h3>

            {/* Visual Sequence Display */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '20px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                marginBottom: '28px',
                flexWrap: 'wrap',
              }}
            >
              {currentQ.sequence.map((item, idx) => {
                const isMissing = item === '?';
                const selectedVal = currentQ.options.find((o) => o.id === selectedOptionId)?.label;
                return (
                  <React.Fragment key={idx}>
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        fontWeight: 800,
                        background: isMissing ? (selectedVal ? '#e0f2fe' : '#ffffff') : '#ffffff',
                        border: isMissing
                          ? selectedVal
                            ? '2px solid #0284c7'
                            : '2px dashed #94a3b8'
                          : '1px solid #cbd5e1',
                        color: isMissing ? (selectedVal ? '#0284c7' : '#94a3b8') : '#0f172a',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isMissing ? (selectedVal ? selectedVal : '?') : item}
                    </div>
                    {idx < currentQ.sequence.length - 1 && (
                      <span style={{ fontSize: '20px', color: '#94a3b8', fontWeight: 600 }}>→</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Multiple Choice Options */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
              {currentQ.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(opt)}
                    disabled={isSubmitted || isExplicitlyPaused}
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: isSelected ? '#f0f9ff' : '#ffffff',
                      color: isSelected ? '#0369a1' : '#1e293b',
                      fontSize: '18px',
                      fontWeight: 700,
                      cursor: isSubmitted || isExplicitlyPaused ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 0 1px #0284c7' : 'none',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: isSelected ? '#0284c7' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#64748b',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {opt.id.slice(-1).toUpperCase()}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Hint Box */}
            {hintVisible && (
              <div
                style={{
                  padding: '14px 18px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '18px' }}>💡</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '2px' }}>
                    PEDAGOGICAL HINT
                  </div>
                  <div style={{ fontSize: '13px', color: '#1e3a8a', lineHeight: 1.4 }}>{currentQ.hint}</div>
                </div>
              </div>
            )}

            {/* Answer Feedback Banner */}
            {answerFeedback && (
              <div
                style={{
                  padding: '14px 18px',
                  background: answerFeedback.isCorrect ? '#f0fdf4' : '#fef2f2',
                  border: answerFeedback.isCorrect ? '1px solid #bbf7d0' : '1px solid #fecaca',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '18px' }}>{answerFeedback.isCorrect ? '✅' : '❌'}</span>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: answerFeedback.isCorrect ? '#166534' : '#991b1b',
                      marginBottom: '2px',
                    }}
                  >
                    {answerFeedback.isCorrect ? 'EXCELLENT!' : 'TRY AGAIN'}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: answerFeedback.isCorrect ? '#14532d' : '#7f1d1d',
                      lineHeight: 1.4,
                    }}
                  >
                    {answerFeedback.text}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px' }}>
              <div>
                {!hintVisible && !isSubmitted && (
                  <button
                    onClick={handleRequestHint}
                    disabled={isExplicitlyPaused}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isExplicitlyPaused ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    💡 Need a Hint?
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {!isSubmitted ? (
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedOptionId || isExplicitlyPaused}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: !selectedOptionId || isExplicitlyPaused ? '#94a3b8' : '#0284c7',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: !selectedOptionId || isExplicitlyPaused ? 'not-allowed' : 'pointer',
                      boxShadow:
                        !selectedOptionId || isExplicitlyPaused ? 'none' : '0 2px 4px rgba(2, 132, 199, 0.25)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0f172a',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(15, 23, 42, 0.25)',
                    }}
                  >
                    {currentQuestionIdx < questions.length - 1 ? 'Next Question →' : 'Restart Activity 🔄'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Live Event Stream Inspector (Collapsible) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              📡 Real-Time Telemetry Stream (SessionEventLogger)
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {allEvents.length} events logged to monotonic session clock. Real latency and pause tracking.
            </div>
          </div>
          <button
            onClick={() => setShowEventLog(!showEventLog)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showEventLog ? 'Hide Event Stream' : 'Inspect Events (' + allEvents.length + ')'}
          </button>
        </div>

        {showEventLog && (
          <div
            style={{
              marginTop: '12px',
              maxHeight: '240px',
              overflowY: 'auto',
              background: '#0f172a',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#e2e8f0',
            }}
          >
            {allEvents.length === 0 ? (
              <div style={{ color: '#64748b' }}>No events recorded yet.</div>
            ) : (
              [...allEvents].reverse().map((evt, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '4px 0',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    gap: '12px',
                  }}
                >
                  <span style={{ color: '#38bdf8', minWidth: '60px' }}>t={evt.time_ms}ms</span>
                  <span style={{ color: '#facc15', fontWeight: 700, minWidth: '130px' }}>{evt.event_type}</span>
                  {evt.response_latency_ms != null && (
                    <span style={{ color: '#4ade80' }}>latency={evt.response_latency_ms}ms</span>
                  )}
                  {evt.accuracy != null && (
                    <span style={{ color: evt.accuracy === 1 ? '#4ade80' : '#f87171' }}>
                      acc={evt.accuracy === 1 ? 'correct' : 'incorrect'}
                    </span>
                  )}
                  {evt.metadata && (
                    <span style={{ color: '#94a3b8' }}>{JSON.stringify(evt.metadata)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
