import React, { useState } from 'react';
import {
  GraduationCap,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Check,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, StatusBadge, ActionVariantBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import type { ActionVariant } from '../../types';

export const TeacherDashboardScreen: React.FC = () => {
  const {
    learner,
    availableLearners,
    switchLearner,
    status,
    stepCount,
    consecutiveFailures,
    teacherLimits,
    updateTeacherLimits,
    currentActivity,
    currentExplainability,
    startSession,
    pauseSession,
    resumeSession,
    resetSession,
    unlockTripwire,
    setRoute
  } = useApp();

  // Local state for configuration form
  const [allowedActionsState, setAllowedActionsState] = useState<ActionVariant[]>([
    ...teacherLimits.allowed_actions
  ]);
  const [maxFailuresState, setMaxFailuresState] = useState<number>(
    teacherLimits.max_failure_sequence
  );
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Unlock modal state
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState('');

  const isTripwireActive = consecutiveFailures >= teacherLimits.max_failure_sequence;

  const handleToggleAllowedAction = (action: ActionVariant) => {
    setAllowedActionsState(prev => {
      if (prev.includes(action)) {
        if (prev.length <= 1) {
          setConfigMessage({ type: 'error', text: 'At least one activity must remain allowed.' });
          return prev;
        }
        return prev.filter(a => a !== action);
      } else {
        return [...prev, action];
      }
    });
  };

  const handleSaveLimits = () => {
    const res = updateTeacherLimits({
      allowed_actions: allowedActionsState,
      max_failure_sequence: maxFailuresState
    });

    if (res.valid) {
      setConfigMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setConfigMessage(null), 3000);
    } else {
      setConfigMessage({ type: 'error', text: res.error || 'Failed to save configuration.' });
    }
  };

  const handleConfirmUnlock = () => {
    unlockTripwire(maxFailuresState);
    setIsUnlockModalOpen(false);
    setOverrideNote('');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Teacher Controls
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure allowed activities, adjust pause limits, and review student progress.
          </p>
        </div>

        {/* Student Switcher & Direct Session Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="student-picker" className="sr-only">Student</label>
          <select
            id="student-picker"
            value={learner.profile_id}
            onChange={e => switchLearner(e.target.value)}
            className="text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-2xs focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            {availableLearners.map(l => (
              <option key={l.profile_id} value={l.profile_id}>
                {l.avatar} {l.name}
              </option>
            ))}
          </select>

          {status === 'active' ? (
            <Button variant="outline" size="sm" icon={<Pause className="w-3.5 h-3.5" />} onClick={pauseSession}>
              Pause
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={startSession}>
              Start Session
            </Button>
          )}

          <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={resetSession}>
            Reset
          </Button>
        </div>
      </div>

      {/* Human Assistance Alert (Only when tripwire is active) */}
      {isTripwireActive && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-scale-in">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-rose-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-rose-900 text-base">
                1-on-1 Assistance Needed for {learner.name.split(' ')[0]}
              </h3>
              <p className="text-xs text-rose-700 mt-1">
                Automated questions paused after {consecutiveFailures} consecutive misses. Please review student before unlocking.
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="md"
            icon={<CheckCircle2 className="w-4 h-4" />}
            onClick={() => setIsUnlockModalOpen(true)}
            className="font-bold flex-shrink-0"
          >
            Unlock Student
          </Button>
        </div>
      )}

      {/* Top 2 Cards: Student Overview & Next Question */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Student Progress */}
        <Card title="Student Status" subtitle={learner.name}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{learner.avatar}</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{learner.name}</h4>
                  <span className="text-xs text-slate-400">
                    Preference: {learner.visual_preference > 0 ? 'Prefers Visual' : 'Prefers Stories'}
                  </span>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500 font-medium">Estimated Counting Mastery</span>
                <span className="font-bold text-emerald-700">{(learner.current_skill * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#3CC172] h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, learner.current_skill * 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Questions Completed</span>
                <span className="font-bold text-slate-800 text-sm">{stepCount}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Current Miss Streak</span>
                <span className={`font-bold text-sm ${consecutiveFailures > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {consecutiveFailures} of {teacherLimits.max_failure_sequence}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Up Next Activity */}
        <Card title="Next Question to Deliver" subtitle="Personalised recommendation">
          {currentActivity ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-2xl flex items-center justify-center flex-shrink-0">
                  {currentActivity.presentation === 'visual' ? '🍎' : '📖'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">{currentActivity.title}</h4>
                    <ActionVariantBadge variant={currentActivity.variant_code} />
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    "{currentActivity.prompt_text}"
                  </p>
                </div>
              </div>

              {currentExplainability && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 font-learner">
                  <span className="font-bold text-slate-700 block mb-0.5">Why this question?</span>
                  {currentExplainability.reason}
                </div>
              )}

              <Button
                variant="primary"
                size="md"
                fullWidth
                icon={<Sparkles className="w-4 h-4" />}
                onClick={() => setRoute('learner')}
                className="font-bold"
              >
                Deliver to Student Now
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">
              <p className="text-xs">No active question.</p>
              <Button variant="primary" size="sm" onClick={startSession} className="mt-2 font-bold">
                Start Session
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Actionable Settings Card */}
      <Card
        title="Session Settings"
        subtitle="Choose which activities are allowed today and set the safety pause limit"
      >
        <div className="space-y-5">
          {/* Allowed Activities Checkboxes */}
          <div>
            <span className="text-xs font-bold text-slate-800 block mb-2">
              Allowed Activity Types
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {(['easy_visual', 'easy_text', 'medium_visual', 'medium_text'] as ActionVariant[]).map(variant => {
                const isAllowed = allowedActionsState.includes(variant);
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => handleToggleAllowedAction(variant)}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                      isAllowed
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-400 font-normal'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center flex-shrink-0 border ${
                        isAllowed ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isAllowed && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <span className="block text-xs capitalize">{variant.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-400 font-normal block">
                        {isAllowed ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Failure Threshold Slider */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                Auto-Pause After Consecutive Misses
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically pauses questions when student struggles so a teacher can step in.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={maxFailuresState}
                onChange={e => setMaxFailuresState(Number(e.target.value))}
                className="w-32 accent-emerald-600 cursor-pointer"
              />
              <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                {maxFailuresState} misses
              </span>
            </div>
          </div>

          {configMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                configMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {configMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{configMessage.text}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="md" onClick={handleSaveLimits} className="font-bold">
              Save Settings
            </Button>
          </div>
        </div>
      </Card>

      {/* Unlock Student Modal */}
      <Modal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        title={`Assist & Unlock ${learner.name.split(' ')[0]}`}
        description="Verify you have assisted the student before unlocking the questions."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsUnlockModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmUnlock} className="font-bold">
              Confirm & Unlock
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-600">
          <p>
            You are clearing the miss streak for <strong>{learner.name}</strong>. The system will resume providing questions according to your allowed activities.
          </p>

          <div>
            <label htmlFor="notes" className="font-bold text-slate-700 block mb-1">
              Notes (Optional)
            </label>
            <input
              id="notes"
              type="text"
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              placeholder="e.g. Practiced with counting blocks for 2 minutes."
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
