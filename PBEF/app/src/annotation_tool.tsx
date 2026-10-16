/**
 * @file annotation_tool.tsx
 * @description React/TypeScript Educator Annotation & Timeline Synchronization Tool.
 * Designed for Component 3 (Participation Forecasting - PBEF).
 *
 * Supports both:
 *  1. Live Synchronized Annotation (when video recording is prohibited by ethics).
 *  2. Retrospective Playback Annotation (scrubbing recorded session timelines).
 *
 * INPUTS:
 *  - Recorded interaction events (`event_log.jsonl` or CSV).
 *  - Annotator identity (`annotator_id`).
 *  - 5-second window duration configuration.
 *
 * OUTPUTS:
 *  - Observable state annotations conforming to docs/OBSERVABLE_LABELS.md
 *  - CSV export formatted as:
 *    `session_id,start_time_ms,end_time_ms,state_label,is_onset,annotator_id,uncertainty,notes`
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

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

export interface SimplifiedEvent {
  time_ms: number;
  event_type: string;
  activity_id?: string;
  response_latency_ms?: number | null;
  prompt_count?: number;
}

export interface AnnotationToolProps {
  sessionId?: string;
  learnerId?: string;
  sessionDurationMs?: number;
  events?: SimplifiedEvent[];
  initialAnnotatorId?: string;
  onSaveAnnotations?: (annotations: AnnotationRecord[]) => void;
}

export const ParticipationAnnotationTool: React.FC<AnnotationToolProps> = ({
  sessionId = 'S20261016_01',
  learnerId = 'L001',
  sessionDurationMs = 180000, // Default 3 minutes
  events = [],
  initialAnnotatorId = 'ANN_01',
  onSaveAnnotations,
}) => {
  const [annotatorId, setAnnotatorId] = useState<string>(initialAnnotatorId);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);

  // Current draft window
  const windowDurationMs = 5000;
  const currentWindowStart = Math.floor(currentTimeMs / windowDurationMs) * windowDurationMs;
  const currentWindowEnd = currentWindowStart + windowDurationMs;

  const [selectedLabel, setSelectedLabel] = useState<StateLabel>('ACTIVE');
  const [isOnset, setIsOnset] = useState<boolean>(false);
  const [isUncertain, setIsUncertain] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  const timerRef = useRef<number | null>(null);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      const stepIntervalMs = 100;
      timerRef.current = window.setInterval(() => {
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
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, sessionDurationMs]);

  // Check if current window already has an annotation
  const existingAnnotationForCurrentWindow = useMemo(() => {
    return annotations.find(
      (a) => a.startTimeMs === currentWindowStart && a.sessionId === sessionId
    );
  }, [annotations, currentWindowStart, sessionId]);

  const handleCommitAnnotation = (label: StateLabel, onset = false, uncertain = false) => {
    const newRecord: AnnotationRecord = {
      sessionId,
      startTimeMs: currentWindowStart,
      endTimeMs: Math.min(currentWindowEnd, sessionDurationMs),
      stateLabel: label,
      isOnset: onset,
      annotatorId,
      uncertainty: uncertain,
      notes,
    };

    setAnnotations((prev) => {
      const filtered = prev.filter(
        (a) => !(a.startTimeMs === currentWindowStart && a.sessionId === sessionId)
      );
      return [...filtered, newRecord].sort((a, b) => a.startTimeMs - b.startTimeMs);
    });

    setNotes('');
    setIsOnset(false);
    setIsUncertain(false);
  };

  const handleExportCsv = () => {
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
      `"${a.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `annotations_${sessionId}_${annotatorId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onSaveAnnotations) {
      onSaveAnnotations(annotations);
    }
  };

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const millis = Math.floor((ms % 1000) / 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}`;
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: '1.5rem', background: '#0f172a', color: '#f8fafc', borderRadius: '12px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8' }}>Participation Annotation & Timeline Tool (C3 PBEF)</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Learner: <strong>{learnerId}</strong> | Session: <strong>{sessionId}</strong> | Window: 5s Bins
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            Annotator ID:
            <select
              value={annotatorId}
              onChange={(e) => setAnnotatorId(e.target.value)}
              style={{ marginLeft: '6px', background: '#1e293b', color: '#f8fafc', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px' }}
            >
              <option value="ANN_01">Educator 01 (ANN_01)</option>
              <option value="ANN_02">Educator 02 (ANN_02)</option>
              <option value="SUPERVISOR">Supervisor / Adjudicator</option>
            </select>
          </label>
          <button
            onClick={handleExportCsv}
            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            Export Annotations CSV
          </button>
        </div>
      </header>

      {/* Scrubbing & Timeline Controls */}
      <section style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{ background: isPlaying ? '#e11d48' : '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isPlaying ? 'Pause' : 'Play Session'}
            </button>
            <button
              onClick={() => setCurrentTimeMs(0)}
              style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Restart
            </button>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '6px 8px', borderRadius: '4px' }}
            >
              <option value="0.5">0.5x</option>
              <option value="1.0">1.0x Normal</option>
              <option value="2.0">2.0x Fast</option>
            </select>
          </div>
          <div style={{ fontSize: '1.1rem', fontFamily: 'monospace', color: '#38bdf8' }}>
            Current: {formatTime(currentTimeMs)} / {formatTime(sessionDurationMs)}
          </div>
        </div>

        {/* Timeline Slider */}
        <input
          type="range"
          min={0}
          max={sessionDurationMs}
          value={currentTimeMs}
          onChange={(e) => setCurrentTimeMs(parseInt(e.target.value, 10))}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
        />

        {/* Timeline Event Markers */}
        <div style={{ position: 'relative', height: '28px', background: '#090d16', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
          {events.map((ev, idx) => {
            const leftPercent = (ev.time_ms / sessionDurationMs) * 100;
            const isResponse = ev.event_type === 'response';
            const color = isResponse ? '#34d399' : ev.event_type.includes('hint') ? '#fbbf24' : '#60a5fa';
            return (
              <div
                key={idx}
                title={`${ev.event_type} at ${formatTime(ev.time_ms)}`}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  width: '3px',
                  height: '100%',
                  background: color,
                  opacity: 0.8,
                }}
              />
            );
          })}
        </div>
      </section>

      {/* Active Annotation Decision Panel */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#93c5fd' }}>
            Window: [{formatTime(currentWindowStart)} - {formatTime(currentWindowEnd)}]
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
            Observable criteria agreement: Ensure gaze diversion or regulatory actions are not classified as disengagement.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1rem' }}>
            <button
              onClick={() => { setSelectedLabel('ACTIVE'); handleCommitAnnotation('ACTIVE', false, false); }}
              style={{
                background: (existingAnnotationForCurrentWindow?.stateLabel ?? selectedLabel) === 'ACTIVE' ? '#059669' : '#334155',
                color: '#fff', padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600
              }}
            >
              ACTIVE (Engaged)
            </button>
            <button
              onClick={() => { setSelectedLabel('PASSIVE_DECREASE'); handleCommitAnnotation('PASSIVE_DECREASE', isOnset, isUncertain); }}
              style={{
                background: (existingAnnotationForCurrentWindow?.stateLabel ?? selectedLabel) === 'PASSIVE_DECREASE' ? '#dc2626' : '#334155',
                color: '#fff', padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600
              }}
            >
              PASSIVE_DECREASE
            </button>
            <button
              onClick={() => { setSelectedLabel('REGULATING'); handleCommitAnnotation('REGULATING', false, false); }}
              style={{
                background: (existingAnnotationForCurrentWindow?.stateLabel ?? selectedLabel) === 'REGULATING' ? '#d97706' : '#334155',
                color: '#fff', padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600
              }}
            >
              REGULATING (Self-Calm)
            </button>
            <button
              onClick={() => { setSelectedLabel('UNCERTAIN'); handleCommitAnnotation('UNCERTAIN', false, true); }}
              style={{
                background: (existingAnnotationForCurrentWindow?.stateLabel ?? selectedLabel) === 'UNCERTAIN' ? '#6b7280' : '#334155',
                color: '#fff', padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600
              }}
            >
              UNCERTAIN / Mask
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isOnset}
                onChange={(e) => setIsOnset(e.target.checked)}
              />
              <span style={{ color: '#f87171', fontWeight: 'bold' }}>Mark as Onset (Transition to Decrease)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isUncertain}
                onChange={(e) => setIsUncertain(e.target.checked)}
              />
              <span style={{ color: '#cbd5e1' }}>Uncertain Observation</span>
            </label>
          </div>

          <input
            type="text"
            placeholder="Optional contextual notes (e.g. looking at door, motor hesitation)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', padding: '8px 12px', borderRadius: '4px', fontSize: '0.85rem' }}
          />
        </div>

        {/* Existing Annotations Summary */}
        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px', maxHeight: '280px', overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Recorded Annotations ({annotations.length} windows)
          </h4>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #475569', color: '#cbd5e1' }}>
                <th style={{ padding: '4px' }}>Window</th>
                <th style={{ padding: '4px' }}>State</th>
                <th style={{ padding: '4px' }}>Onset?</th>
                <th style={{ padding: '4px' }}>Uncertain?</th>
              </tr>
            </thead>
            <tbody>
              {annotations.map((ann, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '4px', fontFamily: 'monospace' }}>
                    {formatTime(ann.startTimeMs)} - {formatTime(ann.endTimeMs)}
                  </td>
                  <td style={{ padding: '4px', fontWeight: 600, color: ann.stateLabel === 'PASSIVE_DECREASE' ? '#f87171' : '#34d399' }}>
                    {ann.stateLabel}
                  </td>
                  <td style={{ padding: '4px', color: ann.isOnset ? '#fbbf24' : '#64748b' }}>
                    {ann.isOnset ? 'YES (Onset)' : '-'}
                  </td>
                  <td style={{ padding: '4px' }}>{ann.uncertainty ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default ParticipationAnnotationTool;
