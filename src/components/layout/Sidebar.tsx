import React from 'react';
import {
  GraduationCap,
  Sparkles,
  ShieldAlert,
  BarChart3,
  BookOpen,
  Coffee,
  FileText,
  Home,
  X,
  Eye
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Badge, StatusBadge } from '../common/Badge';
import type { AppRoute } from '../../types';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const {
    route,
    setRoute,
    learner,
    status,
    consecutiveFailures,
    teacherLimits,
    history,
    highContrast,
    toggleHighContrast
  } = useApp();

  const navItems: { id: AppRoute; label: string; desc: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'overview',
      label: 'Home',
      desc: 'Quick action launcher',
      icon: <Home className="w-5 h-5" />
    },
    {
      id: 'learner',
      label: 'Student Mode',
      desc: 'Interactive counting questions',
      icon: <Sparkles className="w-5 h-5 text-emerald-600" />
    },
    {
      id: 'teacher',
      label: 'Teacher Dashboard',
      desc: 'Allowed activities & limits',
      icon: <GraduationCap className="w-5 h-5" />
    },
    {
      id: 'activities',
      label: 'Activity Bank',
      desc: 'Search & preview 12 activities',
      icon: <BookOpen className="w-5 h-5" />
    },
    {
      id: 'safety',
      label: 'Safety & Help',
      desc: 'Failure pause & unlock',
      icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      badge: consecutiveFailures >= teacherLimits.max_failure_sequence ? 'Help Needed' : undefined
    },
    {
      id: 'research',
      label: 'Reports',
      desc: 'Performance metrics',
      icon: <BarChart3 className="w-5 h-5" />
    },
    {
      id: 'events',
      label: 'History',
      desc: 'Recent question logs',
      icon: <FileText className="w-5 h-5" />,
      badge: history.length > 0 ? String(history.length) : undefined
    }
  ];

  const handleNav = (target: AppRoute) => {
    setRoute(target);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-slate-200 p-5 flex flex-col justify-between overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Mobile close button */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#3CC172] text-white flex items-center justify-center font-bold">
                C2
              </div>
              <span className="font-bold text-slate-800 text-sm">Navigation</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Student Card */}
          <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{learner.avatar}</span>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">{learner.name.split(' ')[0]}</h4>
                  <p className="text-[10px] text-slate-500">Student Profile</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block">Mastery</span>
                <span className="font-bold text-slate-700">
                  {(learner.current_skill * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Miss Streak</span>
                <span
                  className={`font-bold ${
                    consecutiveFailures >= teacherLimits.max_failure_sequence
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }`}
                >
                  {consecutiveFailures} / {teacherLimits.max_failure_sequence}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-1">
              Actions
            </span>
            {navItems.map(item => {
              const isActive = route === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-[#2EA75F] ring-1 ring-emerald-200 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <span className="text-xs block truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-400 block truncate font-normal">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                  {item.badge && (
                    <Badge variant={item.badge.includes('Help') ? 'danger' : 'info'} size="sm">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer / Contrast Toggle */}
        <div className="pt-4 border-t border-slate-100">
          <button
            onClick={toggleHighContrast}
            className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              <span>{highContrast ? 'Standard Contrast' : 'High Contrast'}</span>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
