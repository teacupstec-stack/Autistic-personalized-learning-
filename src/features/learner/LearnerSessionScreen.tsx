import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Coffee,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  Star,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  HelpCircle,
  ThumbsUp,
  Heart,
  Trophy
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/common/Button';
import { VisualItemsRenderer } from '../../components/common/VisualItemsRenderer';
import { getVisualItemInfo } from '../../services/activityService';

export const LearnerSessionScreen: React.FC = () => {
  const {
    learner,
    currentActivity,
    status,
    stepCount,
    submitAnswer,
    requestHint,
    requestBreak,
    startSession,
    endSession,
    history,
    lastFeedback,
    clearFeedback,
    setRoute
  } = useApp();

  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [hintCount, setHintCount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Keyboard accessibility: 1, 2, 3 or A, B, C for options, H for hint, P for break
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is inside an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const key = e.key.toUpperCase();

      if (key === 'P') {
        requestBreak();
        return;
      }

      if (key === 'H' && !lastFeedback) {
        handleHintClick();
        return;
      }

      if (currentActivity && !lastFeedback && !isSubmitting) {
        const letters = ['A', 'B', 'C'];
        const numbers = ['1', '2', '3'];

        const letterIndex = letters.indexOf(key);
        const numberIndex = numbers.indexOf(key);
        const targetIndex = letterIndex !== -1 ? letterIndex : numberIndex;

        if (targetIndex !== -1 && targetIndex < currentActivity.options.length) {
          handleSelectOption(currentActivity.options[targetIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentActivity, lastFeedback, isSubmitting, requestBreak]);

  const handleHintClick = () => {
    const hintText = requestHint();
    setActiveHint(hintText);
    setHintCount(prev => prev + 1);
  };

  const handleSelectOption = (option: number) => {
    if (isSubmitting || lastFeedback) return;
    setIsSubmitting(true);
    submitAnswer(option);
    setIsSubmitting(false);
  };

  const handleNextTask = () => {
    clearFeedback();
    setActiveHint(null);
    setHintCount(0);
  };

  // If session is idle
  if (status === 'idle') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-3xl mx-auto flex items-center justify-center text-4xl mb-4 shadow-sm animate-gentle-float">
          {learner.avatar}
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 font-learner">
          Ready to Learn, {learner.name.split(' ')[0]}?
        </h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed font-learner">
          We have fun counting games with colorful items and friendly stories waiting for you.
          Go at your own pace!
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="primary"
            size="xl"
            icon={<Play className="w-6 h-6" />}
            onClick={startSession}
            className="w-full sm:w-auto font-bold shadow-md hover:scale-105 transition-transform"
          >
            Start Learning Now!
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setRoute('overview')}
            className="w-full sm:w-auto"
          >
            Back to Overview
          </Button>
        </div>
      </div>
    );
  }

  // If session is completed
  if (status === 'completed') {
    const totalDone = history.length;
    const correctCount = history.filter(h => h.outcomeEvent?.outcome).length;
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6 animate-scale-in">
        <div className="w-24 h-24 bg-amber-100 rounded-3xl mx-auto flex items-center justify-center text-5xl shadow-md animate-bounce">
          🏆
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-3.5 py-1 rounded-full">
            Session Completed!
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900 mt-3 font-learner">
            Incredible Work, {learner.name.split(' ')[0]}! 🌟
          </h2>
          <p className="text-sm text-slate-600 mt-2 font-learner max-w-md mx-auto">
            You completed today's counting session! Your stars and achievements have been safely recorded.
          </p>
        </div>

        {/* Stats Summary */}
        <div className="bg-white rounded-3xl border-2 border-emerald-200 p-6 grid grid-cols-3 gap-4 shadow-sm">
          <div>
            <span className="text-2xl font-extrabold text-emerald-600 block">{totalDone}</span>
            <span className="text-xs text-slate-500 font-medium">Tasks Solved</span>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-amber-600 block">{correctCount}</span>
            <span className="text-xs text-slate-500 font-medium">Correct Counts</span>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-purple-600 block">
              {Math.round(learner.current_skill * 100)}%
            </span>
            <span className="text-xs text-slate-500 font-medium">Skill Mastery</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            size="xl"
            icon={<Play className="w-5 h-5" />}
            onClick={startSession}
            className="w-full sm:w-auto font-bold shadow-md hover:scale-105 transition-transform"
          >
            Start New Practice! 🚀
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setRoute('overview')}
            className="w-full sm:w-auto font-bold"
          >
            Back to Home 🏠
          </Button>
        </div>
      </div>
    );
  }

  // If no activity is loaded (e.g. tripwire hit)
  if (!currentActivity) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-4">
          🤝
        </div>
        <h2 className="text-xl font-bold text-slate-900 font-learner">
          Great effort, {learner.name.split(' ')[0]}!
        </h2>
        <p className="text-sm text-slate-600 mt-2 font-learner">
          Let's pause here and check in with your teacher. You did a wonderful job working today!
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => setRoute('safety')}
            className="font-bold"
          >
            Teacher Assistance Screen
          </Button>
        </div>
      </div>
    );
  }

  const itemInfo = getVisualItemInfo(currentActivity);
  const letters = ['A', 'B', 'C'];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Learner Control Bar */}
      <div className="flex items-center justify-between bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        {/* Welcome Greeting & Star Progress */}
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label="Learner Avatar">
            {learner.avatar}
          </span>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              Hello {learner.name.split(' ')[0]}! 🌟
            </span>
            <div className="flex items-center gap-1 mt-0.5" aria-label="Progress Stars">
              {Array.from({ length: Math.min(5, Math.max(1, stepCount)) }).map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4 text-amber-400 fill-amber-400 animate-scale-in"
                />
              ))}
              <span className="text-xs text-slate-500 font-semibold ml-1">
                Task #{stepCount}
              </span>
            </div>
          </div>
        </div>

        {/* Support Buttons: Sound & Prominent Break Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Prominent Persistent "I Need a Break" Button */}
          <Button
            variant="break"
            size="lg"
            icon={<Coffee className="w-5 h-5 text-amber-800" />}
            onClick={requestBreak}
            aria-label="I need a break (zero penalty)"
            className="font-bold shadow-sm hover:scale-105 transition-transform"
          >
            I Need a Break
          </Button>

          {/* Optional Finish Session Button after at least 3 tasks */}
          {stepCount >= 3 && (
            <Button
              variant="outline"
              size="lg"
              icon={<Trophy className="w-4 h-4 text-amber-500" />}
              onClick={endSession}
              aria-label="Finish practice session"
              className="font-bold text-slate-700 hover:text-amber-800 hover:border-amber-300 shadow-2xs"
            >
              Finish ⭐
            </Button>
          )}
        </div>
      </div>

      {/* Main Activity Area */}
      <div className="bg-white rounded-3xl border-2 border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Activity Render (Visual Items or Text Story) */}
        <VisualItemsRenderer activity={currentActivity} interactiveCounting={true} />

        {/* Large Prominent Question */}
        <div className="text-center py-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-learner tracking-tight">
            {currentActivity.prompt_text}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose the button below that matches your count!
          </p>
        </div>

        {/* Large Answer Buttons [A], [B], [C] */}
        {!lastFeedback ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {currentActivity.options.map((option, index) => {
              const letter = letters[index] || String(index + 1);
              return (
                <button
                  key={index}
                  onClick={() => handleSelectOption(option)}
                  disabled={isSubmitting}
                  type="button"
                  aria-label={`Option ${letter}: ${option}`}
                  className="flex items-center justify-between p-5 sm:p-6 rounded-2xl border-3 border-slate-200 bg-white hover:border-[#3CC172] hover:bg-emerald-50/40 text-slate-900 transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 active:scale-[0.97] shadow-sm hover:shadow-md cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-[#3CC172] group-hover:text-white text-slate-700 font-extrabold text-base flex items-center justify-center transition-colors">
                      {letter}
                    </span>
                    <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 group-hover:text-emerald-950 transition-colors font-learner">
                      {option}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
                    Press [{letter}]
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Feedback Card */
          <div
            className={`p-6 sm:p-8 rounded-2xl border-2 text-center space-y-4 animate-scale-in ${
              lastFeedback.correct
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                : 'bg-amber-50/80 border-amber-300 text-amber-950'
            }`}
          >
            <div className="text-5xl">
              {lastFeedback.correct ? '🎉 ⭐ 👏' : '💛 🤝 🎈'}
            </div>

            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold font-learner">
                {lastFeedback.message}
              </h3>
              <p className="text-sm font-medium mt-1">
                {lastFeedback.correct
                  ? `You selected ${lastFeedback.userSelected}. Perfect count!`
                  : `You chose ${lastFeedback.userSelected}. The correct count was ${lastFeedback.correctAnswer}. Great practice!`}
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="xl"
                icon={<ArrowRight className="w-6 h-6" />}
                onClick={handleNextTask}
                className="font-bold shadow-md hover:scale-105 transition-transform"
              >
                Next Fun Question! 🚀
              </Button>
            </div>
          </div>
        )}

        {/* Hint Assistance Action */}
        {!lastFeedback && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              onClick={handleHintClick}
              type="button"
              className="inline-flex items-center gap-2 text-sm font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <Lightbulb className="w-4 h-4 text-amber-600" />
              <span>Ask for a Friendly Hint</span>
              <span className="text-xs font-normal text-amber-600">(Press [H])</span>
            </button>

            <span className="text-xs text-slate-400">
              Take all the time you need. There is no timer!
            </span>
          </div>
        )}

        {/* Hint Bubble Display */}
        {activeHint && !lastFeedback && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex items-start gap-3 animate-fade-in font-learner text-sm">
            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-xs uppercase tracking-wider text-amber-700">
                Hint Assistance ({hintCount}):
              </span>
              <p className="mt-0.5">{activeHint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
