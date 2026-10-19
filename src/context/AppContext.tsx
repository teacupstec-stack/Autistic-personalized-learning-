import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type {
  AppRoute,
  LearnerProfile,
  TeacherLimits,
  Activity,
  ExplainabilityData,
  SessionStatus,
  LogEvent,
  PolicyType
} from '../types';
import { SessionManager, PRESET_LEARNERS, DEFAULT_TEACHER_LIMITS, SessionStepRecord } from '../services/sessionManager';

interface AppContextValue {
  route: AppRoute;
  setRoute: (route: AppRoute) => void;
  learner: LearnerProfile;
  availableLearners: LearnerProfile[];
  switchLearner: (profileId: string) => void;
  teacherLimits: TeacherLimits;
  updateTeacherLimits: (newLimits: Partial<TeacherLimits>) => { valid: boolean; error?: string };
  status: SessionStatus;
  currentActivity: Activity | null;
  currentExplainability: ExplainabilityData | null;
  stepCount: number;
  consecutiveFailures: number;
  hintsUsed: number;
  lastFeedback: {
    correct: boolean;
    reward: number;
    correctAnswer: number;
    userSelected: number;
    message: string;
  } | null;
  clearFeedback: () => void;
  history: SessionStepRecord[];
  allEvents: LogEvent[];
  activePolicy: PolicyType;
  setPolicy: (type: PolicyType) => void;
  isSimulatedMode: boolean;
  toggleSimulatedMode: () => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
  reducedMotion: boolean;

  // Session Actions
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  resetSession: () => void;
  submitAnswer: (option: number) => { correct: boolean; reward: number; tripwireTriggered: boolean };
  requestHint: () => string;
  requestBreak: () => void;
  resumeFromBreak: () => void;
  unlockTripwire: (customMaxFailure?: number) => void;

  // C3 signal simulation
  c3State: {
    value: number;
    confidence: number;
    isExpired: boolean;
  };
  setMockC3: (value: number, confidence: number, isExpired: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<AppRoute>('overview');
  const [session] = useState(() => new SessionManager(PRESET_LEARNERS[0], DEFAULT_TEACHER_LIMITS, 'SCPA_Full'));

  // Reactive state mirroring session
  const [status, setStatus] = useState<SessionStatus>(session.status);
  const [learner, setLearner] = useState<LearnerProfile>(session.learner);
  const [teacherLimits, setTeacherLimits] = useState<TeacherLimits>(session.teacherLimits);
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(session.currentActivity);
  const [currentExplainability, setCurrentExplainability] = useState<ExplainabilityData | null>(session.currentExplainability);
  const [stepCount, setStepCount] = useState<number>(session.stepCount);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(session.consecutiveFailures);
  const [hintsUsed, setHintsUsed] = useState<number>(session.currentHintsUsed);
  const [history, setHistory] = useState<SessionStepRecord[]>([]);
  const [allEvents, setAllEvents] = useState<LogEvent[]>([]);
  const [activePolicy, setActivePolicyState] = useState<PolicyType>('SCPA_Full');
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(true);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const [lastFeedback, setLastFeedback] = useState<{
    correct: boolean;
    reward: number;
    correctAnswer: number;
    userSelected: number;
    message: string;
  } | null>(null);

  const [c3State, setC3State] = useState({
    value: 0.25,
    confidence: 0.85,
    isExpired: false
  });

  const syncStateFromSession = useCallback(() => {
    setStatus(session.status);
    setLearner({ ...session.learner });
    setTeacherLimits({ ...session.teacherLimits });
    setCurrentActivity(session.currentActivity);
    setCurrentExplainability(session.currentExplainability);
    setStepCount(session.stepCount);
    setConsecutiveFailures(session.consecutiveFailures);
    setHintsUsed(session.currentHintsUsed);
    setHistory([...session.history]);
    setAllEvents([...session.allEvents]);
  }, [session]);

  const switchLearner = useCallback((profileId: string) => {
    const found = PRESET_LEARNERS.find(p => p.profile_id === profileId);
    if (found) {
      session.setLearner(found);
      setLastFeedback(null);
      syncStateFromSession();
    }
  }, [session, syncStateFromSession]);

  const setPolicy = useCallback((type: PolicyType) => {
    session.setPolicy(type);
    setActivePolicyState(type);
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const updateTeacherLimits = useCallback((newLimits: Partial<TeacherLimits>) => {
    const result = session.updateTeacherLimits(newLimits);
    if (result.valid) {
      syncStateFromSession();
    }
    return result;
  }, [session, syncStateFromSession]);

  const startSession = useCallback(() => {
    session.startSession();
    setLastFeedback(null);
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const pauseSession = useCallback(() => {
    session.pauseSession();
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const resumeSession = useCallback(() => {
    session.resumeSession();
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const endSession = useCallback(() => {
    session.endSession();
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const resetSession = useCallback(() => {
    session.resetSession();
    setLastFeedback(null);
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const unlockTripwire = useCallback((customMaxFailure?: number) => {
    session.unlockTripwire(customMaxFailure);
    setLastFeedback(null);
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const requestBreak = useCallback(() => {
    session.requestBreak();
    setRoute('break');
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const resumeFromBreak = useCallback(() => {
    session.resumeSession();
    setRoute('learner');
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  const requestHint = useCallback((): string => {
    const hintText = session.requestHint();
    syncStateFromSession();
    return hintText;
  }, [session, syncStateFromSession]);

  const submitAnswer = useCallback((option: number) => {
    const currentAct = session.currentActivity;
    const res = session.submitAnswer(option);

    const friendlyMessages = res.correct
      ? [
          'Wonderful job! That is correct! ⭐',
          'Super counting! You got it right! 🎉',
          'Spot on! Great work counting those items! 🌟',
          'Awesome! You are doing fantastic! ✨'
        ]
      : [
          `Good try! There were ${res.correctAnswer} in total. Let's do the next one together! 💛`,
          `Almost! The answer was ${res.correctAnswer}. Keep exploring! 🌟`,
          `Nice effort! There are ${res.correctAnswer}. You're doing great! 🎈`
        ];

    const message = friendlyMessages[Math.floor(Math.random() * friendlyMessages.length)];

    setLastFeedback({
      correct: res.correct,
      reward: res.reward,
      correctAnswer: res.correctAnswer,
      userSelected: option,
      message
    });

    syncStateFromSession();

    if (res.tripwireTriggered) {
      setRoute('safety');
    }

    return res;
  }, [session, syncStateFromSession]);

  const clearFeedback = useCallback(() => {
    setLastFeedback(null);
  }, []);

  const toggleSimulatedMode = useCallback(() => {
    setIsSimulatedMode(prev => !prev);
  }, []);

  const toggleHighContrast = useCallback(() => {
    setHighContrast(prev => !prev);
  }, []);

  const setMockC3 = useCallback((value: number, confidence: number, isExpired: boolean) => {
    session.setMockC3Risk(value, confidence, isExpired);
    setC3State({ value, confidence, isExpired });
    syncStateFromSession();
  }, [session, syncStateFromSession]);

  // Initial sync
  useEffect(() => {
    syncStateFromSession();
  }, [syncStateFromSession]);

  const value = useMemo(
    () => ({
      route,
      setRoute,
      learner,
      availableLearners: PRESET_LEARNERS,
      switchLearner,
      teacherLimits,
      updateTeacherLimits,
      status,
      currentActivity,
      currentExplainability,
      stepCount,
      consecutiveFailures,
      hintsUsed,
      lastFeedback,
      clearFeedback,
      history,
      allEvents,
      activePolicy,
      setPolicy,
      isSimulatedMode,
      toggleSimulatedMode,
      highContrast,
      toggleHighContrast,
      reducedMotion,
      startSession,
      pauseSession,
      resumeSession,
      endSession,
      resetSession,
      submitAnswer,
      requestHint,
      requestBreak,
      resumeFromBreak,
      unlockTripwire,
      c3State,
      setMockC3
    }),
    [
      route,
      learner,
      switchLearner,
      teacherLimits,
      updateTeacherLimits,
      status,
      currentActivity,
      currentExplainability,
      stepCount,
      consecutiveFailures,
      hintsUsed,
      lastFeedback,
      clearFeedback,
      history,
      allEvents,
      activePolicy,
      setPolicy,
      isSimulatedMode,
      toggleSimulatedMode,
      highContrast,
      toggleHighContrast,
      reducedMotion,
      startSession,
      pauseSession,
      resumeSession,
      endSession,
      resetSession,
      submitAnswer,
      requestHint,
      requestBreak,
      resumeFromBreak,
      unlockTripwire,
      c3State,
      setMockC3
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
