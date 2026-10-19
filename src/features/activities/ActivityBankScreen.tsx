import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Eye,
  CheckCircle,
  Sparkles,
  Sliders,
  Check,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, ActionVariantBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { VisualItemsRenderer } from '../../components/common/VisualItemsRenderer';
import { ACTIVITIES, filterActivities, getVisualItemInfo } from '../../services/activityService';
import type { Activity, ActionVariant } from '../../types';

export const ActivityBankScreen: React.FC = () => {
  const { teacherLimits, updateTeacherLimits, setRoute } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium'>('all');
  const [presentationFilter, setPresentationFilter] = useState<'all' | 'visual' | 'text'>('all');
  const [previewActivity, setPreviewActivity] = useState<Activity | null>(null);

  const filteredActivities = useMemo(() => {
    return filterActivities(searchQuery, difficultyFilter, presentationFilter);
  }, [searchQuery, difficultyFilter, presentationFilter]);

  const handleToggleVariantAllowed = (variant: ActionVariant) => {
    const isCurrentlyAllowed = teacherLimits.allowed_actions.includes(variant);
    let newAllowed: ActionVariant[];

    if (isCurrentlyAllowed) {
      if (teacherLimits.allowed_actions.length <= 1) {
        alert('At least one certified activity variant must remain allowed.');
        return;
      }
      newAllowed = teacherLimits.allowed_actions.filter(a => a !== variant);
    } else {
      newAllowed = [...teacherLimits.allowed_actions, variant];
    }

    updateTeacherLimits({ allowed_actions: newAllowed });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-800 bg-sky-100/70 px-2.5 py-0.5 rounded-full mb-1">
            <BookOpen className="w-3.5 h-3.5 text-sky-700" />
            Curriculum Bank
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Certified Activity Bank
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            12 certified counting activities designed for neurodivergent learners. Verified and approved by educational specialists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" size="md">
            All 12 Activities Certified Approved
          </Badge>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by title, prompt text, or item (e.g. apple, star, kitten)..."
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Difficulty Filter */}
            <select
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value as any)}
              className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy (1 to 3 items)</option>
              <option value="medium">Medium (4 to 5 items)</option>
            </select>

            {/* Presentation Filter */}
            <select
              value={presentationFilter}
              onChange={e => setPresentationFilter(e.target.value as any)}
              className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">All Formats</option>
              <option value="visual">Visual Counting</option>
              <option value="text">Story Problems</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Activity Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredActivities.map(activity => {
          const itemInfo = getVisualItemInfo(activity);
          const isAllowedInSession = teacherLimits.allowed_actions.includes(activity.variant_code);

          return (
            <div
              key={activity.activity_id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all p-5 flex flex-col justify-between group"
            >
              <div>
                {/* Header: Icon, Title, Badges */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl p-2 bg-slate-50 rounded-xl border border-slate-100 flex-shrink-0 group-hover:scale-110 transition-transform">
                      {itemInfo.icon}
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                        {activity.title}
                      </h3>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {activity.activity_id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prompt Text Preview */}
                <p className="text-xs text-slate-600 line-clamp-2 mb-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-learner">
                  "{activity.prompt_text}"
                </p>

                {/* Variant & Difficulty Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <ActionVariantBadge variant={activity.variant_code} />
                  <Badge variant={activity.difficulty === 'easy' ? 'success' : 'warning'} size="sm">
                    {activity.difficulty.toUpperCase()}
                  </Badge>
                  <Badge variant="default" size="sm">
                    {activity.item_count} {itemInfo.name}
                  </Badge>
                </div>

                {/* Options Preview */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                  <span className="text-[11px] font-medium text-slate-400">Options:</span>
                  {activity.options.map((opt, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        opt === activity.correct_answer
                          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {opt} {opt === activity.correct_answer && '✔'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer: Action Controls */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Eye className="w-3.5 h-3.5" />}
                  onClick={() => setPreviewActivity(activity)}
                  className="text-xs"
                >
                  Full Preview
                </Button>

                <button
                  type="button"
                  onClick={() => handleToggleVariantAllowed(activity.variant_code)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                    isAllowedInSession
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title={
                    isAllowedInSession
                      ? 'Allowed in session. Click to exclude.'
                      : 'Excluded. Click to include in session.'
                  }
                >
                  {isAllowedInSession ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Allowed
                    </>
                  ) : (
                    'Excluded'
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredActivities.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">No activities match your filter</h3>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms or filters.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setDifficultyFilter('all');
              setPresentationFilter('all');
            }}
            className="mt-3"
          >
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Full Activity Preview Modal */}
      {previewActivity && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewActivity(null)}
          title={`Activity Preview: ${previewActivity.title}`}
          description={`Variant: ${previewActivity.variant_code} • Correct Answer: ${previewActivity.correct_answer}`}
          maxWidth="lg"
          footer={
            <Button variant="primary" onClick={() => setPreviewActivity(null)}>
              Close Preview
            </Button>
          }
        >
          <div className="space-y-4">
            <VisualItemsRenderer activity={previewActivity} interactiveCounting={true} />

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Target Skill:</span>
                <span className="font-bold">{previewActivity.target_skill}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Presentation Format:</span>
                <span className="font-bold capitalize">{previewActivity.presentation}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Correct Answer:</span>
                <span className="font-bold text-emerald-700">{previewActivity.correct_answer} items</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
