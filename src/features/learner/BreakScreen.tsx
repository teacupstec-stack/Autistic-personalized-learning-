import React, { useState, useEffect } from 'react';
import {
  Coffee,
  Heart,
  Sparkles,
  ShieldCheck,
  Play,
  RotateCcw,
  CheckCircle2,
  Wind
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';

export const BreakScreen: React.FC = () => {
  const { learner, resumeFromBreak, setRoute } = useApp();
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');

  useEffect(() => {
    const cycle = setInterval(() => {
      setBreathPhase(prev => {
        if (prev === 'Inhale') return 'Hold';
        if (prev === 'Hold') return 'Exhale';
        return 'Inhale';
      });
    }, 4000);
    return () => clearInterval(cycle);
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-12 px-4 text-center space-y-8 animate-fade-in">
      {/* Calm Header */}
      <div>
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 px-4 py-1.5 rounded-full text-xs font-bold mb-4">
          <Coffee className="w-4 h-4 text-amber-800" />
          <span>Calm Break State Active</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 font-learner tracking-tight">
          Take a Gentle Pause, {learner.name.split(' ')[0]} 🌿
        </h1>
        <p className="text-sm sm:text-base text-slate-600 mt-2 font-learner max-w-md mx-auto leading-relaxed">
          You worked hard counting. Breaks help your mind rest and recharge.
          Take all the time you need.
        </p>
      </div>

      {/* Gentle Breathing Bubble */}
      <div className="flex flex-col items-center justify-center py-6">
        <div className="relative flex items-center justify-center">
          {/* Outer gentle glowing ring */}
          <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-emerald-100/60 animate-calm-pulse absolute" />

          {/* Inner breathing bubble */}
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-br from-emerald-200 via-teal-100 to-sky-200 shadow-md flex flex-col items-center justify-center text-slate-800 z-10 transition-all duration-1000">
            <Wind className="w-8 h-8 text-emerald-700 mb-1 opacity-80" />
            <span className="font-extrabold text-lg sm:text-xl font-learner text-emerald-950">
              {breathPhase}
            </span>
            <span className="text-[10px] text-emerald-800 font-medium">Breathe gently</span>
          </div>
        </div>
      </div>

      {/* Friendly Reassurance Notice */}
      <div className="bg-white/90 rounded-2xl p-4 border border-emerald-200/80 shadow-xs max-w-md mx-auto text-center font-learner">
        <p className="text-xs text-emerald-900 font-medium">
          ✨ Taking a break does not lower your score or count as a mistake. Take as much time as you need!
        </p>
      </div>

      {/* Resume Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        <Button
          variant="primary"
          size="xl"
          icon={<Play className="w-6 h-6" />}
          onClick={resumeFromBreak}
          className="w-full sm:w-auto font-bold shadow-lg hover:scale-105 transition-transform"
        >
          🌱 I'm Ready to Resume Learning
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setRoute('overview')}
          className="w-full sm:w-auto"
        >
          Go to Overview
        </Button>
      </div>
    </div>
  );
};
