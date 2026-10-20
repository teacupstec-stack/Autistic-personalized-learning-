import React, { useState } from 'react';
import type { SessionEvent } from '../types';
import { 
  FileText, 
  Download, 
  Trash2, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';

interface Props {
  events: SessionEvent[];
  onClearLog: () => void;
}

export const EventLogViewer: React.FC<Props> = ({ events, onClearLog }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Export as JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pusg_session_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export as CSV
  const handleExportCSV = () => {
    const headers = ['id', 'timestamp', 'eventType', 'modality', 'source', 'intent', 'activityId', 'count', 'modelStatus', 'details'];
    const rows = events.map(e => [
      e.id,
      e.timestamp,
      e.eventType,
      e.modality,
      e.source,
      e.intent || '',
      e.activityContext.activityId,
      `${e.activityContext.currentCount}/${e.activityContext.targetCount}`,
      e.modelStatus,
      `"${e.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', encodeURI(csvContent));
    downloadAnchor.setAttribute('download', `pusg_session_log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <section 
      id="session-event-log-section" 
      className="glass-panel" 
      aria-labelledby="event-log-title"
    >
      <div className="panel-header">
        <div>
          <h2 id="event-log-title" className="panel-title">
            <FileText size={20} color="#38BDF8" />
            <span>Session Event Log ({events.length} events)</span>
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Transparent audit record of all communication, gestures, and activity states.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            id="btn-export-json"
            className="btn btn-secondary"
            onClick={handleExportJSON}
            disabled={events.length === 0}
            title="Download log in JSON format"
            aria-label="Export log as JSON"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            <Download size={13} />
            <span>JSON</span>
          </button>

          <button
            id="btn-export-csv"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            disabled={events.length === 0}
            title="Download log in CSV format"
            aria-label="Export log as CSV"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button
            id="btn-clear-log"
            className="btn btn-secondary"
            onClick={onClearLog}
            disabled={events.length === 0}
            title="Clear all recorded session events"
            aria-label="Clear session log"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            <Trash2 size={13} color="#FB7185" />
            <span>Clear</span>
          </button>

          <button
            id="btn-toggle-event-log"
            className="btn btn-secondary"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-label={isExpanded ? 'Collapse log' : 'Expand log'}
            style={{ padding: '0.35rem 0.5rem' }}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            {events.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No events recorded yet. Interact with counting stars or select a communication symbol above.
              </div>
            ) : (
              <table className="data-table" aria-label="Session events table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Event</th>
                    <th scope="col">Modality</th>
                    <th scope="col">Intent</th>
                    <th scope="col">Activity State</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 30).map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {ev.eventType}
                      </td>
                      <td>
                        <span 
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '3px',
                            background: ev.modality === 'symbol' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: ev.modality === 'symbol' ? '#6EE7B7' : '#7DD3FC',
                          }}
                        >
                          {ev.modality}
                        </span>
                      </td>
                      <td>
                        {ev.intent ? (
                          <strong style={{ color: '#F8FAFC' }}>{ev.intent}</strong>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {ev.activityContext.currentCount}/{ev.activityContext.targetCount}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {ev.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <ShieldCheck size={14} color="#10B981" />
            <span>Controlled export: Data is generated entirely on your browser client. No automatic cloud uploads.</span>
          </div>
        </>
      )}
    </section>
  );
};
