import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewScreen } from './features/overview/OverviewScreen';
import { TeacherDashboardScreen } from './features/teacher/TeacherDashboardScreen';
import { ActivityBankScreen } from './features/activities/ActivityBankScreen';
import { LearnerSessionScreen } from './features/learner/LearnerSessionScreen';
import { BreakScreen } from './features/learner/BreakScreen';
import { SafetyInterventionScreen } from './features/safety/SafetyInterventionScreen';
import { ResearchDashboardScreen } from './features/research/ResearchDashboardScreen';
import { EventHistoryScreen } from './features/events/EventHistoryScreen';
import { ShieldCheck, Heart } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { route, highContrast } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const renderCurrentScreen = () => {
    switch (route) {
      case 'overview':
        return <OverviewScreen />;
      case 'teacher':
        return <TeacherDashboardScreen />;
      case 'activities':
        return <ActivityBankScreen />;
      case 'learner':
        return <LearnerSessionScreen />;
      case 'break':
        return <BreakScreen />;
      case 'safety':
        return <SafetyInterventionScreen />;
      case 'research':
        return <ResearchDashboardScreen />;
      case 'events':
        return <EventHistoryScreen />;
      default:
        return <OverviewScreen />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${highContrast ? 'contrast-125' : ''}`}>
      {/* Top Header */}
      <Header
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      <div className="flex-1 flex">
        {/* Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 lg:pl-72 p-4 sm:p-6 lg:p-8 min-w-0 transition-all">
          {renderCurrentScreen()}
        </main>
      </div>

      {/* Accessible Footer */}
      <footer className="lg:pl-72 border-t border-slate-200 bg-white/80 py-4 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              <strong>C2 Safety Contract:</strong> Masked Thompson Sampling • Consecutive Failure Tripwire • Zero-Penalty Break
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>ISO 8601 UTC Canonical Timestamps</span>
            <span>•</span>
            <span>Draft 2020-12 Schema Validated</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
