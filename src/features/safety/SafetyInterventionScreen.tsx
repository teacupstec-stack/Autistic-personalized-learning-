import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Unlock,
  Play,
  ArrowRight,
  Sparkles,
  Sliders
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';

export const SafetyInterventionScreen: React.FC = () => {
  const {
    learner,
    consecutiveFailures,
    teacherLimits,
    unlockTripwire,
    setRoute,
    startSession
  } = useApp();

  const [thresholdInput, setThresholdInput] = useState<number>(teacherLimits.max_failure_sequence);
  const [assistedCheck, setAssistedCheck] = useState<boolean>(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const isTripwireActive = consecutiveFailures >= teacherLimits.max_failure_sequence;

  const handleUnlockAndResume = () => {
    unlockTripwire(thresholdInput);
    setRoute('learner');
  };

  const handleSaveThresholdOnly = () => {
    unlockTripwire(thresholdInput);
    setSaveMessage('Pause limit updated!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Safety & Help Centre
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Automatic pause protects students from frustration. Unlock here when ready.
        </p>
      </div>

      {/* Main Status Hero Card */}
      <div
        className={`rounded-3xl p-6 sm:p-8 border-2 transition-all ${
          isTripwireActive
            ? 'bg-rose-50/90 border-rose-300 text-rose-950'
            : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${
                isTripwireActive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isTripwireActive ? '🤝' : '🌱'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-extrabold font-learner">
                  {isTripwireActive
                    ? `${learner.name.split(' ')[0]}'s Questions Are Paused`
                    : `${learner.name.split(' ')[0]} is Doing Great`}
                </h2>
                <Badge variant={isTripwireActive ? 'danger' : 'success'}>
                  {isTripwireActive ? 'Help Needed' : 'Running Normally'}
                </Badge>
              </div>

              <p className="text-xs sm:text-sm mt-1.5 leading-relaxed max-w-xl">
                {isTripwireActive
                  ? `${learner.name} missed ${consecutiveFailures} questions in a row. The system paused automatically so you can assist them 1-on-1.`
                  : `Miss streak is currently ${consecutiveFailures} of ${teacherLimits.max_failure_sequence}. Questions are flowing normally.`}
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 text-center bg-white/90 p-4 rounded-2xl border border-black/5 shadow-xs min-w-[120px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Miss Streak
            </span>
            <span
              className={`text-3xl font-extrabold block my-1 ${
                isTripwireActive ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {consecutiveFailures} / {teacherLimits.max_failure_sequence}
            </span>
            <span className="text-[11px] text-slate-400">
              {isTripwireActive ? 'Paused' : 'Safe'}
            </span>
          </div>
        </div>

        {/* Big Action Button (When paused) */}
        {isTripwireActive && (
          <div className="mt-6 pt-5 border-t border-rose-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-xs text-rose-900 cursor-pointer">
              <input
                type="checkbox"
                checked={assistedCheck}
                onChange={e => setAssistedCheck(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span>I have checked in and helped {learner.name.split(' ')[0]}</span>
            </label>

            <Button
              variant="primary"
              size="lg"
              icon={<Unlock className="w-5 h-5" />}
              disabled={!assistedCheck}
              onClick={handleUnlockAndResume}
              className="font-bold shadow-md hover:scale-105 transition-transform"
            >
              Unlock & Resume Student Mode 🚀
            </Button>
          </div>
        )}
      </div>

      {/* Simple Settings: Pause Threshold */}
      <Card
        title="Auto-Pause Sensitivity"
        subtitle="How many misses in a row before pausing for teacher help"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-800 block">
              Consecutive Miss Limit
            </span>
            <p className="text-xs text-slate-500">
              When a student misses this many questions in a row, questions pause automatically.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="limit-select" className="sr-only">Limit</label>
            <select
              id="limit-select"
              value={thresholdInput}
              onChange={e => setThresholdInput(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 cursor-pointer"
            >
              <option value={1}>1 miss (Strict)</option>
              <option value={2}>2 misses</option>
              <option value={3}>3 misses (Default)</option>
              <option value={4}>4 misses</option>
              <option value={5}>5 misses</option>
              <option value={6}>6 misses (Relaxed)</option>
            </select>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveThresholdOnly}
              className="font-bold"
            >
              Save
            </Button>
          </div>
        </div>

        {saveMessage && (
          <p className="text-xs text-emerald-700 font-bold mt-3">{saveMessage}</p>
        )}
      </Card>

      {/* Helpful Navigation Links */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={() => setRoute('overview')}>
          Back to Home
        </Button>

        <Button
          variant="secondary"
          icon={<Sparkles className="w-4 h-4 text-emerald-600" />}
          onClick={() => setRoute('learner')}
          className="font-bold"
        >
          Go to Student Mode
        </Button>
      </div>
    </div>
  );
};
