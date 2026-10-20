import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  PictureSymbol, 
  ActivityContext, 
  SessionEvent, 
  ModelStatusType, 
  EnrolledIntentMapping, 
  ParticipantProfile, 
  ClarificationState, 
  IntentMessage 
} from './types';
import { ModelStatusBadge } from './components/ModelStatusBadge';
import { CountingActivity } from './components/CountingActivity';
import { SymbolButtons } from './components/SymbolButtons';
import { CameraPanel } from './components/CameraPanel';
import { TeacherArea } from './components/TeacherArea';
import { ClarificationScreen } from './components/ClarificationScreen';
import { EventLogViewer } from './components/EventLogViewer';
import { inferenceService } from './services/inferenceService';
import { INTENTS, readMemory, remember, clearMemory } from './services/personalMemory';
import type { GestureCapture } from './components/CameraPanel';
import { ShieldCheck, HelpCircle } from 'lucide-react';
import './learning.css';

const INITIAL_PROFILE: ParticipantProfile = {
  participantId: 'P001',
  pseudonym: 'Learner A',
  sessionId: `SES-${Date.now().toString(36).toUpperCase()}`,
  consentConfirmed: false,
  notes: 'Research prototype. Personal memory learns only from confirmed gestures.',
};

function getEnrolments(id: string): EnrolledIntentMapping[] {
  const examples = readMemory(id);
  return INTENTS.map(intent => {
    const matches = examples.filter(e => e.intent === intent);
    return { intent, gestureDescription: 'Learned from confirmed communication',
      status: matches.length ? 'enrolled' : 'pending', samplesCount: matches.length,
      samples: [], lastUpdated: matches.at(-1)?.timestamp };
  });
}

export function App() {
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [activity, setActivity] = useState<'stars' | 'apples'>('stars');

  // Model status: starts as not_loaded, then initializes ONNX runtime web
  const [modelStatus, setModelStatus] = useState<ModelStatusType>('not_loaded');

  useEffect(() => {
    inferenceService.initialize().then((status) => {
      setModelStatus(status);
    });
  }, []);

  // Activity context
  const [activityContext, setActivityContext] = useState<ActivityContext>({
    activityId: 'counting_activity_01',
    activityName: 'Counting Stars',
    currentCount: 0,
    targetCount: 5,
    status: 'idle',
  });

  // Recent confirmed intent
  const [lastConfirmedIntent, setLastConfirmedIntent] = useState<IntentMessage | null>(null);
  const [lastConfirmedSource, setLastConfirmedSource] = useState<string>('direct picture symbol');

  // Teacher / Enrolment state
  const [profile, setProfile] = useState<ParticipantProfile>(INITIAL_PROFILE);
  const [enrolments, setEnrolments] = useState<EnrolledIntentMapping[]>(() => getEnrolments(INITIAL_PROFILE.participantId));

  const pending = useRef<{ participantId: string; embedding: number[] } | null>(null);
  const requestVersion = useRef(0);
  const [processing, setProcessing] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState('');
  const [learnerId, setLearnerId] = useState(INITIAL_PROFILE.participantId);
  function switchLearner() {
    const id = learnerId.trim();
    if (!id || processing) return;
    requestVersion.current++;
    pending.current = null;
    setClarificationState(prev => ({ ...prev, isOpen: false }));
    setProfile(prev => ({ ...prev, participantId: id, pseudonym: id }));
    setEnrolments(getEnrolments(id));
    setLastConfirmedIntent(null);
    setSessionEvents([]);
    setMemoryMessage('Learner memory loaded.');
  }

  // Clarification state
  const [clarificationState, setClarificationState] = useState<ClarificationState>({
    isOpen: false,
    suspectedIntent: null,
    reason: 'low_confidence',
  });

  // Session Event Log
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  // Keep a ref to activityContext for stable event logging
  const activityContextRef = useRef(activityContext);
  useEffect(() => { activityContextRef.current = activityContext; }, [activityContext]);

  // Add event helper
  const logEvent = useCallback((event: Omit<SessionEvent, 'id' | 'timestamp' | 'activityContext' | 'modelStatus'>) => {
    const newEvent: SessionEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      activityContext: activityContextRef.current,
      modelStatus,
      ...event,
    };
    setSessionEvents(prev => [newEvent, ...prev]);
  }, [modelStatus]);

  // Handle activity changes
  const handleActivityUpdate = useCallback((ctx: ActivityContext) => {
    setActivityContext(ctx);
  }, []);

  // Handle direct symbol selection (Priority 1.0)
  const handleSelectSymbol = useCallback((symbol: PictureSymbol) => {
    pending.current = null;
    requestVersion.current++;
    setClarificationState(prev => ({ ...prev, isOpen: false }));
    setLastConfirmedIntent(symbol.intent);
    setLastConfirmedSource('direct picture symbol');

    logEvent({
      eventType: 'symbol_selected',
      modality: 'symbol',
      source: 'learner_symbol',
      intent: symbol.intent,
      details: `Learner directly selected symbol "${symbol.label}" (100% confidence, known meaning).`,
    });
  }, [logEvent]);

  // Handle intentional gesture capture start
  const handleGestureCaptureStart = useCallback(() => {
    logEvent({
      eventType: 'gesture_capture_started',
      modality: 'gesture',
      source: 'gesture_model',
      details: 'Learner initiated explicit 2.0s intentional gesture capture window.',
    });
  }, [logEvent]);

  // Handle intentional gesture capture complete with ONNX inference
  const handleGestureCaptureComplete = useCallback(async (sample: GestureCapture) => {
    const version = ++requestVersion.current;
    pending.current = null;
    setProcessing(true);
    try {
      const result = await inferenceService.predict(sample.features, profile.participantId);
      if (version !== requestVersion.current) return;
      if (!result) throw new Error('Gesture model is unavailable. Please use picture symbols.');
      pending.current = { participantId: profile.participantId, embedding: result.embedding };
      logEvent({
        eventType: 'gesture_capture_completed', modality: 'gesture', source: 'gesture_model',
        intent: result.candidateIntent, rawConfidence: result.confidence,
        details: 'Real camera gesture processed in ' + result.latencyMs + 'ms. Awaiting confirmation; memory unchanged.',
      });
      // All captures require an explicit label before online learning.
      setClarificationState({
        isOpen: true, suspectedIntent: result.candidateIntent,
        confidenceScore: result.confidence, reason: result.clarificationFlag ? 'low_confidence' : 'teacher_check',
      });
    } finally { setProcessing(false); }
  }, [logEvent, profile.participantId]);

  // Handle camera permission change
  const handlePermissionChange = useCallback((status: 'granted' | 'denied' | 'prompt') => {
    logEvent({
      eventType: 'camera_permission_changed',
      modality: 'system',
      source: 'learner_symbol',
      details: `Camera permission changed to: ${status}.`,
    });
  }, [logEvent]);

  // Trigger test clarification (for teacher/developer testing)
  const handleTestClarification = (intent: IntentMessage = 'Help', reason: ClarificationState['reason'] = 'low_confidence') => {
    pending.current = null;
    setClarificationState({
      isOpen: true,
      suspectedIntent: intent,
      confidenceScore: 0.54,
      reason,
    });
    logEvent({
      eventType: 'clarification_prompted',
      modality: 'multimodal',
      source: 'clarification',
      intent,
      details: `Clarification modal opened (Reason: ${reason}, Suspected Intent: ${intent}).`,
    });
  };

  // Confirm intent through clarification
  const handleConfirmClarification = (intent: IntentMessage) => {
    const sample = pending.current;
    if (sample && sample.participantId === profile.participantId) {
      try {
        remember(sample.participantId, intent, sample.embedding);
        setEnrolments(getEnrolments(sample.participantId));
        setMemoryMessage('Confirmed ' + intent + '. Personal gesture memory updated.');
        logEvent({ eventType: 'teacher_enrolment_saved', modality: 'teacher', source: 'teacher_enrolment',
          intent, details: 'Confirmed camera embedding saved for learner ' + sample.participantId + '.' });
      } catch {
        setMemoryMessage('Message confirmed, but memory could not be saved. Browser storage may be full or unavailable.');
      }
    }
    pending.current = null;
    setLastConfirmedIntent(intent);
    setLastConfirmedSource('clarification confirmation');
    setClarificationState(prev => ({ ...prev, isOpen: false }));

    logEvent({
      eventType: 'clarification_resolved',
      modality: 'multimodal',
      source: 'clarification',
      intent,
      details: `Clarification resolved. Learner confirmed intent: "${intent}".`,
    });
  };

  // Dismiss clarification
  const handleDismissClarification = () => {
    pending.current = null;
    setClarificationState(prev => ({ ...prev, isOpen: false }));
    logEvent({
      eventType: 'clarification_cancelled',
      modality: 'multimodal',
      source: 'clarification',
      details: 'Learner or caregiver dismissed clarification screen.',
    });
  };

  // No placeholder samples: learning occurs only after a real capture is labelled.
  const handleTestEnrolmentSample = (intent: IntentMessage) => {
    setMemoryMessage('To learn ' + intent + ', record a gesture above, then select its actual meaning in the confirmation screen.');
  };

  const handleClearLog = () => {
    setSessionEvents([]);
  };

  return (
    <div className="app-container">
      <header className="learning-header">
        <div><span className="learning-mark">Little Steps</span><h1>Let’s learn together</h1><p>Take your time. You can ask for help whenever you like.</p></div>
        <button className="btn btn-secondary" aria-expanded={teacherOpen} aria-controls="teacher-tools"
          onClick={() => setTeacherOpen(v => !v)}>{teacherOpen ? 'Back to learning' : 'For grown-ups'}</button>
      </header>
      <main className="learner-space">
        <nav className="activity-picker" aria-label="Choose an activity">
          <button className={activity === 'stars' ? 'activity-choice selected' : 'activity-choice'} aria-pressed={activity === 'stars'} onClick={() => setActivity('stars')}>★ Count the stars</button>
          <button className={activity === 'apples' ? 'activity-choice selected' : 'activity-choice'} aria-pressed={activity === 'apples'} onClick={() => setActivity('apples')}>● Count the apples</button>
        </nav>
        <CountingActivity key={profile.participantId + activity} variant={activity} onActivityUpdate={handleActivityUpdate} />
        <div className="learning-communication">
          <SymbolButtons onSelectSymbol={handleSelectSymbol} lastConfirmedIntent={lastConfirmedIntent} lastConfirmedSource={lastConfirmedSource} />
          <CameraPanel key={profile.participantId} disabled={processing || clarificationState.isOpen} modelStatus={modelStatus}
            onGestureCaptureStart={handleGestureCaptureStart} onGestureCaptureComplete={handleGestureCaptureComplete}
            onPermissionChange={handlePermissionChange} />
        </div>
      </main>
      <div id="teacher-tools" hidden={!teacherOpen} className="teacher-tools">
        <div className="panel-header"><h2>Grown-up workspace</h2><ModelStatusBadge status={modelStatus} />
          <button className="btn btn-secondary" disabled={processing || clarificationState.isOpen} onClick={() => handleTestClarification('Help', 'low_confidence')}><HelpCircle size={16} /> Preview message check</button>
        </div>
        <p>Learning happens quietly after a gesture is confirmed or corrected. Guesses never train the memory. The base encoder stays fixed; personal references adapt.</p>
      <section className="glass-panel">
        <h2>Learner gesture memory</h2>
        <label>Learner ID <input value={learnerId} disabled={processing} maxLength={80}
          onChange={e => setLearnerId(e.target.value)} /></label>
        <button className="btn btn-secondary" disabled={processing} onClick={switchLearner}>Load learner</button>
        <p>Active learner: <strong>{profile.participantId}</strong>. Confirmed examples stay in this browser, separately for each learner.</p>
        <button className="btn btn-secondary" disabled={processing} onClick={() => {
          if (!window.confirm('Delete saved gesture memory for ' + profile.participantId + '?')) return;
          try {
            clearMemory(profile.participantId); pending.current = null;
            setClarificationState(prev => ({ ...prev, isOpen: false }));
            setEnrolments(getEnrolments(profile.participantId)); setMemoryMessage('Personal memory deleted.');
          } catch { setMemoryMessage('Unable to delete memory from browser storage.'); }
        }}>Delete this learner’s gesture memory</button>
        <p role="status">{memoryMessage}</p>
        <p>Teacher notification: <strong aria-live="polite">{lastConfirmedIntent || 'No confirmed message yet'}</strong></p>
      </section>
      {/* Teacher / Caregiver Enrolment Area */}
      <TeacherArea
        enrolments={enrolments}
        profile={profile}
        onUpdateEnrolment={updated => setEnrolments(updated.map(m => ({ ...m, ...getEnrolments(profile.participantId).find(saved => saved.intent === m.intent), gestureDescription: m.gestureDescription })))}
        onUpdateProfile={setProfile}
        onTestEnrolmentSample={handleTestEnrolmentSample}
      />

      {/* Session Event Log and Controlled Export */}
      <EventLogViewer
        events={sessionEvents}
        onClearLog={handleClearLog}
      />

      </div>
      {/* Clarification Screen Modal */}
      <ClarificationScreen
        state={clarificationState}
        onConfirmIntent={handleConfirmClarification}
        onDismiss={handleDismissClarification}
      />

      <footer className="learning-footer"><ShieldCheck size={16} /> Pictures are always available. Camera use is optional and stays on this device.</footer>
    </div>
  );
}

export default App;
