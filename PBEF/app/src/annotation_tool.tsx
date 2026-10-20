/**
 * @file annotation_tool.tsx
 * @description React/TypeScript Educator Annotation & Timeline Synchronization Tool.
 * Designed for Component 3 (Participation Forecasting - PBEF).
 *
 * Supports:
 *  1. Dual-Mode Operation: Live Synchronized Annotation & Retrospective Playback Scrubbing.
 *  2. 5-Second Binned Timeline with Segment Coloring (Active, Decrease, Regulating, Uncertain).
 *  3. Dynamic Window Event Inspector showing latencies, touches, pauses, and prompts.
 *  4. Observable Criteria Enforcement: Distinguishes task disengagement from self-regulation.
 *  5. Keyboard Shortcuts for high-throughput educator coding (1-4, O, U, Space, Arrows, Enter).
 *  6. JSONL Event & CSV Annotation Importers + Standardized Data Contract CSV Exporter.
 *  7. Dual-Annotator Agreement Engine (Cohen's Kappa & Onset Concordance).
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { InteractionEvent } from './event_logger';

export type StateLabel = 'ACTIVE' | 'PASSIVE_DECREASE' | 'REGULATING' | 'UNCERTAIN';

export interface AnnotationRecord {
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  stateLabel: StateLabel;
  isOnset: boolean;
  annotatorId: string;
  uncertainty: boolean;
  notes: string;
}

export interface InterventionEvent {
  session_id: string;
  time_ms: number;
  intervention_type: string;
  initiator?: string;
  impact?: string;
}

export interface AnnotationToolProps {
  sessionId?: string;
  learnerId?: string;
  sessionDurationMs?: number;
  events?: InteractionEvent[];
  interventions?: InterventionEvent[];
  initialAnnotatorId?: string;
  onSaveAnnotations?: (annotations: AnnotationRecord[]) => void;
  onRunInForecaster?: (annotations: AnnotationRecord[]) => void;
}

const LABEL_COLORS: Record<StateLabel, { bg: string; border: string; text: string; badge: string }> = {
  ACTIVE: {
    bg: '#064e3b',
    border: '#059669',
    text: '#a7f3d0',
    badge: '#10b981',
  },
  PASSIVE_DECREASE: {
    bg: '#7f1d1d',
    border: '#dc2626',
    text: '#fecaca',
    badge: '#ef4444',
  },
  REGULATING: {
    bg: '#78350f',
    border: '#d97706',
    text: '#fde68a',
    badge: '#f59e0b',
  },
  UNCERTAIN: {
    bg: '#374151',
    border: '#6b7280',
    text: '#e5e7eb',
    badge: '#9ca3af',
  },
};

export const ParticipationAnnotationTool: React.FC<AnnotationToolProps> = ({
  sessionId: initialSessionId = 'S_L001_01',
  learnerId: initialLearnerId = 'L001',
  sessionDurationMs: initialDurationMs = 300000, // 5 minutes default
  events: initialEvents = [],
  interventions: initialInterventions = [],
  initialAnnotatorId = 'ANN_01',
  onSaveAnnotations,
  onRunInForecaster,
}) => {
  // Session Configuration State
  const [sessionId, setSessionId] = useState<string>(initialSessionId);
  const [learnerId, setLearnerId] = useState<string>(initialLearnerId);
  const [sessionDurationMs, setSessionDurationMs] = useState<number>(initialDurationMs);
  const [annotatorId, setAnnotatorId] = useState<string>(initialAnnotatorId);
  const [events, setEvents] = useState<InteractionEvent[]>(initialEvents);
  const [interventions, setInterventions] = useState<InterventionEvent[]>(initialInterventions);

  // Timeline & Playback State
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Primary Annotations
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);

  // Secondary Annotations for Dual-Annotator Agreement
  const [secondaryAnnotations, setSecondaryAnnotations] = useState<AnnotationRecord[]>([]);
  const [showAgreementModal, setShowAgreementModal] = useState<boolean>(false);

  // Active Draft Window Configuration (5-second bins)
  const windowDurationMs = 5000;
  const currentWindowStart = Math.floor(currentTimeMs / windowDurationMs) * windowDurationMs;
  const currentWindowEnd = Math.min(currentWindowStart + windowDurationMs, sessionDurationMs);

  // Active Window Form Inputs
  const [selectedLabel, setSelectedLabel] = useState<StateLabel>('ACTIVE');
  const [isOnset, setIsOnset] = useState<boolean>(false);
  const [isUncertain, setIsUncertain] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  // Toast / Status Message
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Synchronize draft form inputs when active window changes
  useEffect(() => {
    const existing = annotations.find(
      (a) => a.startTimeMs === currentWindowStart && a.sessionId === sessionId
    );
    if (existing) {
      setSelectedLabel(existing.stateLabel);
      setIsOnset(existing.isOnset);
      setIsUncertain(existing.uncertainty);
      setNotes(existing.notes || '');
    } else {
      setIsOnset(false);
      setIsUncertain(false);
      setNotes('');
    }
  }, [currentWindowStart, sessionId, annotations]);

  // Monotonic Playback Loop
  useEffect(() => {
    if (isPlaying) {
      const stepIntervalMs = 100;
      timerRef.current = setInterval(() => {
        setCurrentTimeMs((prev) => {
          const next = prev + Math.round(stepIntervalMs * playbackSpeed);
          if (next >= sessionDurationMs) {
            setIsPlaying(false);
            return sessionDurationMs;
          }
          return next;
        });
      }, stepIntervalMs);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, sessionDurationMs]);

  // Window-level events inspector
  const eventsInCurrentWindow = useMemo(() => {
    return events.filter(
      (e) => e.time_ms >= currentWindowStart && e.time_ms < currentWindowEnd
    );
  }, [events, currentWindowStart, currentWindowEnd]);

  const windowEventStats = useMemo(() => {
    const responses = eventsInCurrentWindow.filter((e) => e.event_type === 'response');
    const touches = eventsInCurrentWindow.filter((e) => e.event_type.startsWith('touch'));
    const prompts = eventsInCurrentWindow.filter((e) => e.event_type.includes('hint'));
    const pauses = eventsInCurrentWindow.filter((e) => e.event_type === 'idle_pause');

    const latencies = responses
      .map((r) => r.response_latency_ms)
      .filter((l): l is number => typeof l === 'number' && !isNaN(l));

    const meanLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : null;

    return {
      responseCount: responses.length,
      touchCount: touches.length,
      promptCount: prompts.length,
      pauseCount: pauses.length,
      meanLatency,
      maxLatency,
    };
  }, [eventsInCurrentWindow]);

  // Commit Current Annotation
  const handleCommitCurrentWindow = useCallback(
    (advanceAfterSave = false, overrideLabel?: StateLabel) => {
      const labelToSave = overrideLabel ?? selectedLabel;
      const newRecord: AnnotationRecord = {
        sessionId,
        startTimeMs: currentWindowStart,
        endTimeMs: currentWindowEnd,
        stateLabel: labelToSave,
        isOnset,
        annotatorId,
        uncertainty: isUncertain,
        notes: notes.trim(),
      };

      setAnnotations((prev) => {
        const remaining = prev.filter(
          (a) => !(a.startTimeMs === currentWindowStart && a.sessionId === sessionId)
        );
        return [...remaining, newRecord].sort((a, b) => a.startTimeMs - b.startTimeMs);
      });

      showStatus(`Saved [${Math.floor(currentWindowStart / 1000)}s - ${Math.floor(currentWindowEnd / 1000)}s]: ${labelToSave}`);

      if (advanceAfterSave) {
        const nextTime = Math.min(currentWindowStart + windowDurationMs, sessionDurationMs);
        setCurrentTimeMs(nextTime);
      }
    },
    [sessionId, currentWindowStart, currentWindowEnd, selectedLabel, isOnset, annotatorId, isUncertain, notes, sessionDurationMs, windowDurationMs]
  );

  // Delete Annotation for current window
  const handleDeleteCurrentAnnotation = () => {
    setAnnotations((prev) =>
      prev.filter((a) => !(a.startTimeMs === currentWindowStart && a.sessionId === sessionId))
    );
    setIsOnset(false);
    setIsUncertain(false);
    setNotes('');
    showStatus(`Deleted annotation for [${Math.floor(currentWindowStart / 1000)}s - ${Math.floor(currentWindowEnd / 1000)}s]`);
  };

  // Step window backward/forward
  const handleStepWindow = (direction: 'prev' | 'next') => {
    const delta = direction === 'next' ? windowDurationMs : -windowDurationMs;
    const target = Math.max(0, Math.min(currentWindowStart + delta, sessionDurationMs));
    setCurrentTimeMs(target);
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing notes
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Enter') {
          handleCommitCurrentWindow(true);
        }
        return;
      }

      switch (e.key) {
        case '1':
          setSelectedLabel('ACTIVE');
          handleCommitCurrentWindow(true, 'ACTIVE');
          break;
        case '2':
          setSelectedLabel('PASSIVE_DECREASE');
          handleCommitCurrentWindow(true, 'PASSIVE_DECREASE');
          break;
        case '3':
          setSelectedLabel('REGULATING');
          handleCommitCurrentWindow(true, 'REGULATING');
          break;
        case '4':
          setSelectedLabel('UNCERTAIN');
          handleCommitCurrentWindow(true, 'UNCERTAIN');
          break;
        case 'o':
        case 'O':
          setIsOnset((prev) => !prev);
          break;
        case 'u':
        case 'U':
          setIsUncertain((prev) => !prev);
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying((prev) => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleStepWindow('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleStepWindow('next');
          break;
        case 'Enter':
          e.preventDefault();
          handleCommitCurrentWindow(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCommitCurrentWindow]);

  // Export CSV conforming strictly to docs/DATA_CONTRACT.md & OBSERVABLE_LABELS.md
  const handleExportCsv = () => {
    if (annotations.length === 0) {
      alert('No annotations recorded to export.');
      return;
    }

    const headers = [
      'session_id',
      'start_time_ms',
      'end_time_ms',
      'state_label',
      'is_onset',
      'annotator_id',
      'uncertainty',
      'notes',
    ];

    const rows = annotations.map((a) => [
      a.sessionId,
      a.startTimeMs,
      a.endTimeMs,
      a.stateLabel,
      a.isOnset ? 1 : 0,
      a.annotatorId,
      a.uncertainty ? 1 : 0,
      `"${(a.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `annotations_${sessionId}_${annotatorId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (onSaveAnnotations) {
      onSaveAnnotations(annotations);
    }
    showStatus(`Exported ${annotations.length} annotations to CSV`);
  };

  // Import JSONL raw events
  const handleImportJsonl = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        const parsedEvents: InteractionEvent[] = [];

        for (const line of lines) {
          const parsed = JSON.parse(line) as InteractionEvent;
          parsedEvents.push(parsed);
        }

        if (parsedEvents.length > 0) {
          parsedEvents.sort((a, b) => a.time_ms - b.time_ms);
          setEvents(parsedEvents);

          const inferredSessionId = parsedEvents[0].session_id || sessionId;
          const inferredLearnerId = parsedEvents[0].learner_id || learnerId;
          const maxTime = Math.max(...parsedEvents.map((ev) => ev.time_ms));

          setSessionId(inferredSessionId);
          setLearnerId(inferredLearnerId);
          setSessionDurationMs(Math.max(60000, Math.ceil(maxTime / 5000) * 5000));
          setCurrentTimeMs(0);
          showStatus(`Loaded ${parsedEvents.length} interaction events from ${file.name}`);
        }
      } catch (err) {
        alert(`Error parsing JSONL: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import CSV Annotations
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>, isSecondary = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length < 2) return;

        const records: AnnotationRecord[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length >= 7) {
            records.push({
              sessionId: parts[0].trim(),
              startTimeMs: parseInt(parts[1], 10),
              endTimeMs: parseInt(parts[2], 10),
              stateLabel: parts[3].trim() as StateLabel,
              isOnset: parseInt(parts[4], 10) === 1,
              annotatorId: parts[5].trim(),
              uncertainty: parseInt(parts[6], 10) === 1,
              notes: parts.slice(7).join(',').replace(/^"|"$/g, '').trim(),
            });
          }
        }

        if (isSecondary) {
          setSecondaryAnnotations(records);
          setShowAgreementModal(true);
          showStatus(`Loaded ${records.length} secondary annotations for agreement comparison`);
        } else {
          setAnnotations(records);
          showStatus(`Imported ${records.length} annotations`);
        }
      } catch (err) {
        alert(`Error parsing CSV: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Inter-Rater Agreement Calculation (Cohen's Kappa & Onset Concordance)
  const agreementMetrics = useMemo(() => {
    if (annotations.length === 0 || secondaryAnnotations.length === 0) return null;

    const windowsMap = new Map<number, { ann1?: StateLabel; ann2?: StateLabel; onset1?: boolean; onset2?: boolean }>();

    for (const a of annotations) {
      const entry = windowsMap.get(a.startTimeMs) || {};
      entry.ann1 = a.stateLabel;
      entry.onset1 = a.isOnset;
      windowsMap.set(a.startTimeMs, entry);
    }

    for (const a of secondaryAnnotations) {
      const entry = windowsMap.get(a.startTimeMs) || {};
      entry.ann2 = a.stateLabel;
      entry.onset2 = a.isOnset;
      windowsMap.set(a.startTimeMs, entry);
    }

    let sharedCount = 0;
    let agreementCount = 0;
    let onsetAgreementCount = 0;
    let totalOnsets = 0;

    const categories: StateLabel[] = ['ACTIVE', 'PASSIVE_DECREASE', 'REGULATING', 'UNCERTAIN'];
    const countA: Record<StateLabel, number> = { ACTIVE: 0, PASSIVE_DECREASE: 0, REGULATING: 0, UNCERTAIN: 0 };
    const countB: Record<StateLabel, number> = { ACTIVE: 0, PASSIVE_DECREASE: 0, REGULATING: 0, UNCERTAIN: 0 };

    windowsMap.forEach((val) => {
      if (val.ann1 && val.ann2) {
        sharedCount++;
        countA[val.ann1]++;
        countB[val.ann2]++;
        if (val.ann1 === val.ann2) {
          agreementCount++;
        }
        if (val.onset1 || val.onset2) {
          totalOnsets++;
          if (val.onset1 === val.onset2) {
            onsetAgreementCount++;
          }
        }
      }
    });

    if (sharedCount === 0) return null;

    const po = agreementCount / sharedCount;
    let pe = 0;
    for (const cat of categories) {
      pe += (countA[cat] / sharedCount) * (countB[cat] / sharedCount);
    }

    const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1.0;
    const onsetAccuracy = totalOnsets > 0 ? onsetAgreementCount / totalOnsets : 1.0;

    return {
      sharedWindows: sharedCount,
      percentAgreement: Math.round(po * 100),
      cohensKappa: Math.round(kappa * 100) / 100,
      onsetAgreement: Math.round(onsetAccuracy * 100),
    };
  }, [annotations, secondaryAnnotations]);

  // Format Helper
  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalWindowsCount = Math.ceil(sessionDurationMs / windowDurationMs);

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '1.5rem',
        background: '#0b0f19',
        color: '#f8fafc',
        borderRadius: '16px',
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7)',
        border: '1px solid #1e293b',
      }}
    >
      {/* Toast Notification */}
      {statusMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            padding: '10px 18px',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 9999,
            fontSize: '0.875rem',
            fontWeight: 600,
            backdropFilter: 'blur(8px)',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Header Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '1.25rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                letterSpacing: '0.05em',
              }}
            >
              C3 PBEF
            </span>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc' }}>
              Participation Timeline & Annotation Suite
            </h1>
          </div>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Learner: <strong style={{ color: '#38bdf8' }}>{learnerId}</strong> &bull; Session:{' '}
            <strong style={{ color: '#38bdf8' }}>{sessionId}</strong> &bull; Total Windows:{' '}
            <strong>{totalWindowsCount}</strong> &bull; Annotated:{' '}
            <strong style={{ color: '#34d399' }}>{annotations.length}</strong>
          </p>
        </div>

        {/* Global Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Annotator selector */}
          <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Annotator:
            <select
              value={annotatorId}
              onChange={(e) => setAnnotatorId(e.target.value)}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <option value="ANN_01">Educator 01 (ANN_01)</option>
              <option value="ANN_02">Educator 02 (ANN_02)</option>
              <option value="SUPERVISOR">Supervisor / Adjudicator</option>
            </select>
          </label>

          {/* Import JSONL */}
          <label
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Load Events JSONL
            <input type="file" accept=".jsonl,.json" onChange={handleImportJsonl} style={{ display: 'none' }} />
          </label>

          {/* Import CSV */}
          <label
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Load Annotations CSV
            <input type="file" accept=".csv" onChange={(e) => handleImportCsv(e, false)} style={{ display: 'none' }} />
          </label>

          {/* Agreement Check Button */}
          <button
            onClick={() => {
              if (secondaryAnnotations.length === 0) {
                const input = document.getElementById('secondary-csv-input');
                if (input) input.click();
              } else {
                setShowAgreementModal(true);
              }
            }}
            style={{
              background: '#334155',
              color: '#e2e8f0',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {secondaryAnnotations.length > 0 ? 'View Kappa Agreement' : 'Compare 2nd Annotator'}
          </button>
          <input
            id="secondary-csv-input"
            type="file"
            accept=".csv"
            onChange={(e) => handleImportCsv(e, true)}
            style={{ display: 'none' }}
          />

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            style={{
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#fff',
              border: 'none',
              padding: '7px 16px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            Export Annotations CSV
          </button>

          {/* Direct Pipeline to Tab 1 Forecaster */}
          {onRunInForecaster && (
            <button
              onClick={() => {
                if (annotations.length === 0) {
                  showStatus('Annotate at least one window before running forecaster.');
                  return;
                }
                onRunInForecaster(annotations);
              }}
              style={{
                background: '#047857',
                color: '#fff',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(4, 120, 87, 0.3)',
              }}
              title="Transfer current annotations into Tab 1 Live Forecaster and jump to Tab 1"
            >
              <span>▶</span>
              <span>Run in Live Forecaster (Tab 1)</span>
            </button>
          )}
        </div>
      </header>

      {/* Segmented 5-Second Window Ribbon (Interactive Visual Map) */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
            Session Overview Ribbon (Click any 5-second window to jump)
          </span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: '#cbd5e1' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: LABEL_COLORS.ACTIVE.badge }} />
              Active
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: LABEL_COLORS.PASSIVE_DECREASE.badge }} />
              Decrease
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: LABEL_COLORS.REGULATING.badge }} />
              Regulating
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: LABEL_COLORS.UNCERTAIN.badge }} />
              Uncertain
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#38bdf8' }} />
              Cursor
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${totalWindowsCount}, minmax(4px, 1fr))`,
            height: '24px',
            background: '#090d16',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #1e293b',
            cursor: 'pointer',
          }}
        >
          {Array.from({ length: totalWindowsCount }).map((_, idx) => {
            const wStart = idx * windowDurationMs;
            const ann = annotations.find((a) => a.startTimeMs === wStart && a.sessionId === sessionId);
            const isCurrent = currentWindowStart === wStart;

            let bgColor = '#1e293b';
            if (ann) {
              bgColor = LABEL_COLORS[ann.stateLabel]?.badge || '#475569';
            }

            return (
              <div
                key={idx}
                onClick={() => setCurrentTimeMs(wStart)}
                title={`Window ${idx + 1}: ${formatTime(wStart)} - ${formatTime(wStart + windowDurationMs)}${ann ? ` [${ann.stateLabel}${ann.isOnset ? ' ONSET' : ''}]` : ' (Unannotated)'}`}
                style={{
                  background: isCurrent ? '#38bdf8' : bgColor,
                  position: 'relative',
                  borderRight: '1px solid rgba(0,0,0,0.3)',
                  transition: 'background 0.15s ease',
                  boxShadow: isCurrent ? 'inset 0 0 0 2px #fff' : 'none',
                }}
              >
                {ann?.isOnset && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: '#fbbf24',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Scrubbing & Timeline Controls */}
      <section
        style={{
          background: '#131b2e',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: isPlaying ? '#e11d48' : '#10b981',
                color: '#fff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {isPlaying ? 'Pause' : 'Play Timeline'}
            </button>
            <button
              onClick={() => handleStepWindow('prev')}
              title="Keyboard shortcut: Left Arrow"
              style={{
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              &larr; Prev Window (-5s)
            </button>
            <button
              onClick={() => handleStepWindow('next')}
              title="Keyboard shortcut: Right Arrow"
              style={{
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Next Window (+5s) &rarr;
            </button>
            <button
              onClick={() => setCurrentTimeMs(0)}
              style={{
                background: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Reset 0s
            </button>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '0.8rem',
              }}
            >
              <option value="0.5">0.5x Speed</option>
              <option value="1.0">1.0x Normal</option>
              <option value="2.0">2.0x Fast</option>
            </select>
          </div>

          <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>
            {formatTime(currentTimeMs)} / {formatTime(sessionDurationMs)}
          </div>
        </div>

        {/* Continuous Range Slider */}
        <input
          type="range"
          min={0}
          max={sessionDurationMs}
          value={currentTimeMs}
          onChange={(e) => setCurrentTimeMs(parseInt(e.target.value, 10))}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
        />

        {/* Raw Event Density Tick Bar */}
        <div
          style={{
            position: 'relative',
            height: '20px',
            background: '#090d16',
            borderRadius: '4px',
            marginTop: '6px',
            overflow: 'hidden',
          }}
        >
          {events.map((ev, idx) => {
            const leftPct = (ev.time_ms / sessionDurationMs) * 100;
            const isResp = ev.event_type === 'response';
            const color = isResp ? '#34d399' : ev.event_type.includes('hint') ? '#fbbf24' : '#60a5fa';
            return (
              <div
                key={idx}
                title={`${ev.event_type} (${ev.response_latency_ms ? `${ev.response_latency_ms}ms` : ''}) at ${formatTime(ev.time_ms)}`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: '2px',
                  height: '100%',
                  background: color,
                  opacity: 0.75,
                }}
              />
            );
          })}

          {/* Intervention Markers */}
          {interventions.map((inv, idx) => {
            const leftPct = (inv.time_ms / sessionDurationMs) * 100;
            return (
              <div
                key={`inv-${idx}`}
                title={`Intervention: ${inv.intervention_type} at ${formatTime(inv.time_ms)}`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: '4px',
                  height: '100%',
                  background: '#c084fc',
                  zIndex: 2,
                }}
              />
            );
          })}
        </div>
      </section>

      {/* Main Workspace Grid: Decision Panel + Window Event Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Left Column: Decision & Annotation Coding Panel */}
        <div
          style={{
            background: '#131b2e',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>
                Active Annotation Window
              </span>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#38bdf8' }}>
                [{formatTime(currentWindowStart)} - {formatTime(currentWindowEnd)}] &bull; 5-Second Bin
              </h2>
            </div>
            {annotations.some((a) => a.startTimeMs === currentWindowStart) && (
              <span
                style={{
                  background: '#065f46',
                  color: '#a7f3d0',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Annotated
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
            Classify observable behavioral state. Looking away or self-regulatory movement (stimming) must
            <strong style={{ color: '#fde68a' }}> NOT</strong> be classified as a decrease.
          </p>

          {/* Label Category Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
            {(['ACTIVE', 'PASSIVE_DECREASE', 'REGULATING', 'UNCERTAIN'] as StateLabel[]).map((label) => {
              const isSelected = selectedLabel === label;
              const colorConfig = LABEL_COLORS[label];

              return (
                <button
                  key={label}
                  onClick={() => {
                    setSelectedLabel(label);
                    handleCommitCurrentWindow(false, label);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: isSelected ? colorConfig.bg : '#1e293b',
                    border: isSelected ? `2px solid ${colorConfig.border}` : '1px solid #334155',
                    color: isSelected ? colorConfig.text : '#cbd5e1',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px' }}>
                    {label === 'ACTIVE' && '1. ACTIVE'}
                    {label === 'PASSIVE_DECREASE' && '2. PASSIVE_DECREASE'}
                    {label === 'REGULATING' && '3. REGULATING'}
                    {label === 'UNCERTAIN' && '4. UNCERTAIN'}
                  </span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                    {label === 'ACTIVE' && 'Attending, expected latency'}
                    {label === 'PASSIVE_DECREASE' && 'Stopping touches, ignoring tasks'}
                    {label === 'REGULATING' && 'Self-calm, motor stimming'}
                    {label === 'UNCERTAIN' && 'Masked, camera obstruction'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Onset & Uncertainty Checkboxes */}
          <div
            style={{
              background: '#090d16',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '1rem',
              display: 'flex',
              gap: '1.25rem',
              alignItems: 'center',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={isOnset}
                onChange={(e) => {
                  setIsOnset(e.target.checked);
                }}
                style={{ accentColor: '#ef4444', transform: 'scale(1.15)' }}
              />
              <span style={{ color: isOnset ? '#f87171' : '#cbd5e1', fontWeight: isOnset ? 700 : 500 }}>
                Eligible Decrease Onset (Key: O)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={isUncertain}
                onChange={(e) => {
                  setIsUncertain(e.target.checked);
                }}
                style={{ accentColor: '#9ca3af', transform: 'scale(1.15)' }}
              />
              <span style={{ color: isUncertain ? '#fbbf24' : '#cbd5e1' }}>Uncertain Observation (Key: U)</span>
            </label>
          </div>

          {/* Contextual Notes Input */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
              Contextual Notes / Adjudication Comments:
            </label>
            <input
              type="text"
              placeholder="e.g., child rocked rhythmically, teacher prompt delivered at 14.2s..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#090d16',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '9px 12px',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleCommitCurrentWindow(true)}
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Save & Advance Window &rarr;
            </button>
            <button
              onClick={() => handleCommitCurrentWindow(false)}
              style={{
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                padding: '10px 14px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Save Only
            </button>
            {annotations.some((a) => a.startTimeMs === currentWindowStart) && (
              <button
                onClick={handleDeleteCurrentAnnotation}
                style={{
                  background: '#450a0a',
                  color: '#f87171',
                  border: '1px solid #991b1b',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Window Event Inspector */}
        <div
          style={{
            background: '#131b2e',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>
              Micro-Feature Evidence
            </span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#93c5fd' }}>
              Events in Current 5s Bin ({eventsInCurrentWindow.length} items)
            </h3>
          </div>

          {/* Quick Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '0.75rem' }}>
            <div style={{ background: '#090d16', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Responses</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#34d399' }}>{windowEventStats.responseCount}</div>
            </div>
            <div style={{ background: '#090d16', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Touches</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#60a5fa' }}>{windowEventStats.touchCount}</div>
            </div>
            <div style={{ background: '#090d16', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Avg Latency</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fbbf24' }}>
                {windowEventStats.meanLatency ? `${windowEventStats.meanLatency}ms` : '-'}
              </div>
            </div>
            <div style={{ background: '#090d16', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Max Latency</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: windowEventStats.maxLatency && windowEventStats.maxLatency > 3000 ? '#f87171' : '#cbd5e1' }}>
                {windowEventStats.maxLatency ? `${windowEventStats.maxLatency}ms` : '-'}
              </div>
            </div>
          </div>

          {/* Event Stream Scroll List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '220px', background: '#090d16', borderRadius: '6px', padding: '8px' }}>
            {eventsInCurrentWindow.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No interaction events logged in this 5-second interval (Idle period).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {eventsInCurrentWindow.map((ev, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#131b2e',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      borderLeft: `3px solid ${ev.event_type === 'response' ? '#10b981' : ev.event_type.includes('hint') ? '#fbbf24' : '#38bdf8'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#f8fafc' }}>{ev.event_type}</strong>
                      <span style={{ color: '#94a3b8', marginLeft: '6px' }}>@{formatTime(ev.time_ms)}</span>
                      {ev.response_latency_ms != null && (
                        <span style={{ color: '#fbbf24', marginLeft: '6px' }}>
                          ({ev.response_latency_ms}ms)
                        </span>
                      )}
                    </div>
                    {ev.accuracy != null && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          background: ev.accuracy === 1 ? '#065f46' : '#7f1d1d',
                          color: ev.accuracy === 1 ? '#a7f3d0' : '#fecaca',
                        }}
                      >
                        {ev.accuracy === 1 ? 'Correct' : 'Error'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recorded Annotations Table */}
      <section
        style={{
          background: '#131b2e',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc' }}>
            Annotation Register & Breakdown ({annotations.length} recorded)
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Hotkeys: <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>1-4</kbd> Label,{' '}
            <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>O</kbd> Onset,{' '}
            <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>U</kbd> Uncertain,{' '}
            <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>Enter</kbd> Save & Next
          </span>
        </div>

        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                <th style={{ padding: '6px 8px' }}>Window</th>
                <th style={{ padding: '6px 8px' }}>Participation State</th>
                <th style={{ padding: '6px 8px' }}>Onset?</th>
                <th style={{ padding: '6px 8px' }}>Uncertainty</th>
                <th style={{ padding: '6px 8px' }}>Annotator</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Jump</th>
              </tr>
            </thead>
            <tbody>
              {annotations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    No windows annotated yet. Start playback or scrub to a window to code.
                  </td>
                </tr>
              ) : (
                annotations.map((ann, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      background: currentWindowStart === ann.startTimeMs ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                      {formatTime(ann.startTimeMs)} - {formatTime(ann.endTimeMs)}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span
                        style={{
                          background: LABEL_COLORS[ann.stateLabel]?.bg,
                          color: LABEL_COLORS[ann.stateLabel]?.text,
                          border: `1px solid ${LABEL_COLORS[ann.stateLabel]?.border}`,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                        }}
                      >
                        {ann.stateLabel}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', color: ann.isOnset ? '#f87171' : '#64748b', fontWeight: ann.isOnset ? 700 : 400 }}>
                      {ann.isOnset ? 'YES (Onset)' : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', color: ann.uncertainty ? '#fbbf24' : '#64748b' }}>
                      {ann.uncertainty ? 'Uncertain' : 'Normal'}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{ann.annotatorId}</td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ann.notes || '-'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => setCurrentTimeMs(ann.startTimeMs)}
                        style={{
                          background: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dual-Annotator Agreement Modal */}
      {showAgreementModal && agreementMetrics && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1.15rem' }}>
              Dual-Annotator Reliability Analysis
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
              Conforming to <strong style={{ color: '#cbd5e1' }}>docs/OBSERVABLE_LABELS.md</strong> Section 4 (20% dual-coverage protocol).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cohen&apos;s Kappa (&kappa;)</div>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: agreementMetrics.cohensKappa >= 0.7 ? '#34d399' : agreementMetrics.cohensKappa >= 0.5 ? '#fbbf24' : '#f87171',
                  }}
                >
                  {agreementMetrics.cohensKappa}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  {agreementMetrics.cohensKappa >= 0.7 ? 'Substantial Agreement' : 'Moderate Agreement'}
                </div>
              </div>

              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>State Overlap</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                  {agreementMetrics.percentAgreement}%
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Across {agreementMetrics.sharedWindows} dual windows
                </div>
              </div>
            </div>

            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Onset Timing Concordance:</span>
                <strong style={{ color: '#fbbf24' }}>{agreementMetrics.onsetAgreement}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Disagreement Adjudication:</span>
                <strong style={{ color: '#34d399' }}>Flagged for Supervisor</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowAgreementModal(false)}
                style={{
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close & Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipationAnnotationTool;
