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
  Menu
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../common/Badge';
import { Button } from '../common/Button';
import type { AppRoute } from '../../types';

export interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const {
    route,
    setRoute,
    learner,
    availableLearners,
    switchLearner,
    status,
    requestBreak
  } = useApp();

  const navItems: { id: AppRoute; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'learner', label: 'Student Mode', icon: <Sparkles className="w-4 h-4 text-emerald-600" /> },
    { id: 'teacher', label: 'Teacher', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'activities', label: 'Activities', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'safety', label: 'Safety', icon: <ShieldAlert className="w-4 h-4 text-amber-600" /> },
    { id: 'research', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'events', label: 'History', icon: <FileText className="w-4 h-4" /> }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand Logo & Mobile Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              aria-label={isSidebarOpen ? 'Close navigation' : 'Open navigation'}
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              onClick={() => setRoute('overview')}
              className="flex items-center gap-2 text-left focus:outline-none group"
            >
              <div className="w-9 h-9 rounded-xl bg-[#3CC172] text-white flex items-center justify-center font-extrabold text-lg shadow-sm group-hover:bg-[#2EA75F] transition-colors">
                C2
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-sm tracking-tight block">
                  Learning Personalisation
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">
                  Educational Action System
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map(item => {
              const isActive = route === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setRoute(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-[#2EA75F] ring-1 ring-emerald-200 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Session Status Pill */}
            <div className="hidden sm:block">
              <StatusBadge status={status} />
            </div>

            {/* Learner Selector */}
            <div className="relative">
              <label htmlFor="learner-select" className="sr-only">Select Student</label>
              <select
                id="learner-select"
                value={learner.profile_id}
                onChange={e => switchLearner(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {availableLearners.map(l => (
                  <option key={l.profile_id} value={l.profile_id}>
                    {l.avatar} {l.name.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Break Button */}
            <Button
              variant="break"
              size="sm"
              icon={<Coffee className="w-3.5 h-3.5" />}
              onClick={requestBreak}
              title="Pause and take a calm break"
              className="text-xs font-bold"
            >
              Take a Break
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
