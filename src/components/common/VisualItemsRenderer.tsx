import React, { useState } from 'react';
import type { Activity } from '../../types';
import { getVisualItemInfo } from '../../services/activityService';

export interface VisualItemsRendererProps {
  activity: Activity;
  interactiveCounting?: boolean;
}

export const VisualItemsRenderer: React.FC<VisualItemsRendererProps> = ({
  activity,
  interactiveCounting = true
}) => {
  const [countedIndices, setCountedIndices] = useState<number[]>([]);
  const isVisual = activity.presentation === 'visual';
  const itemCount = activity.item_count || 3;
  const itemInfo = getVisualItemInfo(activity);

  const toggleItemCounted = (index: number) => {
    if (!interactiveCounting) return;
    setCountedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  if (!isVisual) {
    // Text-based Story Problem Presentation
    return (
      <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/40 rounded-2xl p-6 sm:p-8 border border-amber-200/80 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" role="img" aria-label={itemInfo.name}>
            {itemInfo.icon}
          </span>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
              Story Problem
            </span>
            <h4 className="text-lg font-bold text-slate-800 mt-1">{activity.title}</h4>
          </div>
        </div>

        <div className="bg-white/80 rounded-xl p-5 border border-amber-100 shadow-xs mb-4">
          <p className="text-lg sm:text-xl text-slate-800 font-medium leading-relaxed font-learner">
            "{activity.prompt_text}"
          </p>
        </div>

        <div className="text-xs text-slate-500 flex items-center justify-between">
          <span>Read carefully and select the number you find in the story!</span>
          <span className="font-semibold text-amber-700">Format: Text Story</span>
        </div>
      </div>
    );
  }

  // Visual Activity Container (Apples, Stars, Fish, Balloons, Birds, Sun)
  const itemsArray = Array.from({ length: itemCount }, (_, i) => i);

  // Background scene style based on activity type
  const getSceneTheme = () => {
    const title = activity.title.toLowerCase();
    if (title.includes('star')) {
      return {
        bg: 'bg-gradient-to-b from-indigo-950 via-slate-900 to-indigo-900',
        border: 'border-indigo-800',
        ground: 'text-indigo-200',
        sky: '✨ 🌙 ✨',
        itemFilter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.8))'
      };
    }
    if (title.includes('fish')) {
      return {
        bg: 'bg-gradient-to-b from-cyan-100 via-sky-100 to-blue-200',
        border: 'border-cyan-300',
        ground: 'text-blue-900',
        sky: '🫧 🌊 🫧',
        itemFilter: 'drop-shadow(0 4px 6px rgba(6, 182, 212, 0.3))'
      };
    }
    if (title.includes('apple') || title.includes('bird')) {
      return {
        bg: 'bg-gradient-to-b from-sky-100 via-emerald-50 to-green-100',
        border: 'border-emerald-300',
        ground: 'text-emerald-900',
        sky: '☁️ 🌳 ☁️',
        itemFilter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.3))'
      };
    }
    if (title.includes('balloon')) {
      return {
        bg: 'bg-gradient-to-b from-pink-50 via-sky-50 to-amber-50',
        border: 'border-pink-200',
        ground: 'text-pink-900',
        sky: '☁️ 🎈 ☁️',
        itemFilter: 'drop-shadow(0 4px 8px rgba(236, 72, 153, 0.3))'
      };
    }
    return {
      bg: 'bg-gradient-to-b from-emerald-50 to-teal-50',
      border: 'border-emerald-200',
      ground: 'text-teal-900',
      sky: '☀️ ☁️',
      itemFilter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))'
    };
  };

  const theme = getSceneTheme();

  return (
    <div
      className={`rounded-2xl border-2 ${theme.border} ${theme.bg} p-6 sm:p-8 shadow-inner relative overflow-hidden transition-all`}
    >
      {/* Decorative ambient background text */}
      <div className="absolute top-3 right-4 text-xs font-semibold tracking-wider text-slate-400 select-none">
        {theme.sky}
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wider bg-white/90 text-slate-700 px-3 py-1 rounded-full shadow-xs">
          Visual Counting Area
        </span>
        {interactiveCounting && (
          <span className="text-xs text-slate-600 bg-white/80 px-2.5 py-1 rounded-lg">
            Tip: Tap items as you count them! ({countedIndices.length} / {itemCount})
          </span>
        )}
      </div>

      {/* Rendered Items Display Grid */}
      <div
        className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 py-8 min-h-[160px] sm:min-h-[190px]"
        role="group"
        aria-label={`${itemCount} ${itemInfo.name} to count`}
      >
        {itemsArray.map(idx => {
          const isCounted = countedIndices.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleItemCounted(idx)}
              type="button"
              aria-label={`${itemInfo.name.slice(0, -1)} number ${idx + 1}`}
              className={`relative group p-3 sm:p-4 rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 select-none ${
                isCounted
                  ? 'scale-110 bg-white/90 ring-4 ring-emerald-400 shadow-lg'
                  : 'hover:scale-105 bg-white/60 hover:bg-white/80 shadow-sm'
              }`}
            >
              <span
                className="text-5xl sm:text-6xl block transition-transform group-hover:scale-110 active:scale-95"
                style={{ filter: theme.itemFilter }}
              >
                {itemInfo.icon}
              </span>

              {/* Number Badge for Counted Items */}
              {isCounted && (
                <span className="absolute -top-2 -right-2 bg-emerald-600 text-white font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-scale-in">
                  {idx + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Helpful count progress footer */}
      <div className="flex items-center justify-between pt-3 border-t border-black/5 text-xs text-slate-600">
        <span>Counting: {itemInfo.name}</span>
        {countedIndices.length > 0 && (
          <button
            onClick={() => setCountedIndices([])}
            className="text-emerald-700 hover:text-emerald-900 font-semibold underline underline-offset-2"
          >
            Clear count marks
          </button>
        )}
      </div>
    </div>
  );
};
