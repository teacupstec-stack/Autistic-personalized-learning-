import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../context/AppContext';
import { AppContent } from '../App';
import { LearnerSessionScreen } from '../features/learner/LearnerSessionScreen';
import { BreakScreen } from '../features/learner/BreakScreen';
import { SafetyInterventionScreen } from '../features/safety/SafetyInterventionScreen';

describe('Frontend Component Rendering & User Experience Flow', () => {
  it('renders application action launcher with student and teacher actions', () => {
    render(
      <AppProvider>
        <AppContent />
      </AppProvider>
    );

    expect(screen.getByText(/Learning Action Centre/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Student Mode/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Teacher Dashboard/i).length).toBeGreaterThan(0);
  });

  it('navigates cleanly between Teacher Dashboard, Activity Bank, and Reports screens', () => {
    render(
      <AppProvider>
        <AppContent />
      </AppProvider>
    );

    // Navigate to Teacher Dashboard
    const teacherBtns = screen.getAllByText(/Teacher/i);
    fireEvent.click(teacherBtns[0]);
    expect(screen.getByText(/Teacher Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Allowed Activity Types/i)).toBeInTheDocument();

    // Navigate to Reports / Research Dashboard
    const reportBtns = screen.getAllByText(/Reports/i);
    fireEvent.click(reportBtns[0]);
    expect(screen.getByText(/Multi-Policy Comparison on Held-Out Test Profiles/i)).toBeInTheDocument();
  });

  it('renders Break Screen with calm breathing text and reassuring prompt', () => {
    render(
      <AppProvider>
        <BreakScreen />
      </AppProvider>
    );

    expect(screen.getByText(/Take a Gentle Pause/i)).toBeInTheDocument();
    expect(screen.getByText(/Taking a break does not lower your score/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready to Resume Learning/i)).toBeInTheDocument();
  });

  it('renders Safety & Help Screen with auto-pause status and miss limit settings', () => {
    render(
      <AppProvider>
        <SafetyInterventionScreen />
      </AppProvider>
    );

    expect(screen.getByText(/Safety & Help Centre/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto-Pause Sensitivity/i)).toBeInTheDocument();
    expect(screen.getByText(/Consecutive Miss Limit/i)).toBeInTheDocument();
  });

  it('advances to a new question when Next Fun Question is clicked', () => {
    render(
      <AppProvider>
        <LearnerSessionScreen />
      </AppProvider>
    );

    // Start session
    const startBtn = screen.getByText(/Start Learning Now!/i);
    fireEvent.click(startBtn);

    // Initial task #1 is active
    expect(screen.getByText(/Task #1/i)).toBeInTheDocument();

    // Find and click an answer button (e.g. option A, B, or C)
    const optionButtons = screen.getAllByRole('button', { name: /Option/i });
    expect(optionButtons.length).toBeGreaterThan(0);
    fireEvent.click(optionButtons[0]);

    // Next Fun Question button appears
    const nextBtn = screen.getByText(/Next Fun Question!/i);
    expect(nextBtn).toBeInTheDocument();

    // Click Next Fun Question
    fireEvent.click(nextBtn);

    // Task count advances to Task #2
    expect(screen.getByText(/Task #2/i)).toBeInTheDocument();
  });
});
