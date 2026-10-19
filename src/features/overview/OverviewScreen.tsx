import React from 'react';
import {
  Sparkles,
  GraduationCap,
  BookOpen,
  ShieldAlert,
  Play,
  RotateCcw,
  Pause,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Heart
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, StatusBadge, ActionVariantBadge } from '../../components/common/Badge';

export const OverviewScreen: React.FC = () => {
  const {
    setRoute,
    learner,
    availableLearners,
    switchLearner,
    status,
    stepCount,
    consecutiveFailures,
    teacherLimits,
    currentActivity,
    startSession,
    pauseSession,
    resumeSession,
    resetSession
  } = useApp();

  const isTripwireActive = consecutiveFailures >= teacherLimits.max_failure_sequence;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Safety Alert (Only shows if student needs help) */}
      {isTripwireActive && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-scale-in">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-rose-900 text-sm sm:text-base">
                Teacher Help Needed for {learner.name.split(' ')[0]}
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Activity selection paused after {consecutiveFailures} consecutive misses. Please provide 1-on-1 guidance.
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setRoute('safety')}
            className="font-bold flex-shrink-0"
          >
            Review & Unlock
          </Button>
        </div>
      )}

      {/* Main Action Launcher */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-6 sm:p-8 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2 max-w-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{learner.avatar}</span>
            <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
              Current Student: {learner.name}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Learning Action Centre
          </h1>
          <p className="text-emerald-50 text-xs sm:text-sm">
            Select an action below to start learning, adjust settings, or inspect student progress.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="xl"
            icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
            onClick={() => {
              if (status === 'idle') startSession();
              setRoute('learner');
            }}
            className="font-extrabold text-slate-900 bg-white hover:bg-emerald-50 shadow-md text-base"
          >
            Start Student Mode
          </Button>
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Active Student & Switcher */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{learner.avatar}</span>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Active Student</span>
              <h3 className="font-bold text-slate-800 text-sm">{learner.name.split(' ')[0]}</h3>
            </div>
          </div>
          <select
            value={learner.profile_id}
            onChange={e => switchLearner(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 cursor-pointer"
          >
            {availableLearners.map(l => (
              <option key={l.profile_id} value={l.profile_id}>
                {l.name.split(' ')[0]}
              </option>
            ))}
          </select>
        </div>

        {/* Current Skill */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-500 font-medium">Counting Mastery</span>
            <span className="font-bold text-emerald-700">{(learner.current_skill * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-[#3CC172] h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, learner.current_skill * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Completed: {stepCount} question(s)
          </span>
        </div>

        {/* Session Status & Quick Controls */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Session State</span>
            <StatusBadge status={status} />
          </div>

          <div className="flex items-center gap-1.5">
            {status === 'active' ? (
              <Button variant="outline" size="sm" icon={<Pause className="w-3.5 h-3.5" />} onClick={pauseSession}>
                Pause
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={startSession}>
                Start
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={resetSession} title="Reset">
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Main Actions Grid (Direct tasks only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Action 1: Student Learning Mode */}
        <div
          onClick={() => {
            if (status === 'idle') startSession();
            setRoute('learner');
          }}
          className="p-5 bg-white rounded-2xl border-2 border-emerald-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
            🧸
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                Student Mode
              </h3>
              <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Deliver fun visual counting questions (apples, stars, fish) with big A/B/C answer buttons and breaks.
            </p>
          </div>
        </div>

        {/* Action 2: Teacher Settings */}
        <div
          onClick={() => setRoute('teacher')}
          className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
            🎓
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                Teacher Dashboard
              </h3>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select allowed activities, set failure pause limits, and view next recommended activity.
            </p>
          </div>
        </div>

        {/* Action 3: Activity Bank */}
        <div
          onClick={() => setRoute('activities')}
          className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
            📚
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                Activity Bank
              </h3>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Search and preview all 12 certified counting activities. Choose which ones to allow today.
            </p>
          </div>
        </div>

        {/* Action 4: Safety & Help */}
        <div
          onClick={() => setRoute('safety')}
          className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
            🛡️
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                Safety & Help
              </h3>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              View consecutive failure protection, assist student 1-on-1, and unlock paused sessions.
            </p>
          </div>
        </div>
      </div>

      {/* Up Next Preview Card (if active) */}
      {currentActivity && (
        <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {currentActivity.presentation === 'visual' ? '🍎' : '📖'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{currentActivity.title}</span>
                <ActionVariantBadge variant={currentActivity.variant_code} />
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{currentActivity.prompt_text}</p>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setRoute('learner')}
            className="font-bold flex-shrink-0"
          >
            Answer in Student Mode
          </Button>
        </div>
      )}
    </div>
  );
};
