/**
 * sessionLoader.ts
 * ================
 * PBEF Component 3 — Session Ingestion & Validation Service
 * Loads, parses, validates, and sorts learner interaction events from CSV and JSONL files.
 */

import { SessionEvent, InputMode } from '../types/participation';

export interface LoadedSession {
  sessionId: string;
  durationSec: number;
  events: SessionEvent[];
  source: 'csv' | 'jsonl';
  inputMode: InputMode;
}

export function parseSessionEvents(content: string, fileName: string): LoadedSession {
  const isJsonl = fileName.endsWith('.jsonl') || fileName.endsWith('.json');
  const lines = content.trim().split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error(`File '${fileName}' is empty or contains no valid rows.`);
  }

  const events: SessionEvent[] = [];
  let detectedSessionId = 'S_UNKNOWN';

  if (isJsonl) {
    for (let i = 0; i < lines.length; i++) {
      try {
        const row = JSON.parse(lines[i]);
        const eventId = String(row.event_id || `e_${i}`);
        const sessionId = String(row.session_id || 'S_DEFAULT');
        const timestampSec = typeof row.timestamp_sec === 'number'
          ? row.timestamp_sec
          : typeof row.time_ms === 'number'
          ? row.time_ms / 1000
          : null;

        if (timestampSec === null || !Number.isFinite(timestampSec) || timestampSec < 0) {
          throw new Error(`Row ${i + 1}: Invalid or missing timestamp`);
        }

        detectedSessionId = sessionId;
        events.push({
          event_id: eventId,
          session_id: sessionId,
          timestamp_sec: timestampSec,
          type: (row.type || row.event_type || 'touch') as any,
          task_id: row.task_id || row.activity_id,
          metadata: row.metadata || {
            latencyMs: row.response_latency_ms,
            accuracy: row.accuracy,
          },
        });
      } catch (err: any) {
        throw new Error(`Failed to parse JSONL line ${i + 1} in '${fileName}': ${err.message}`);
      }
    }
  } else {
    // CSV Parsing
    const header = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const timeIdx = header.findIndex((h) => h === 'timestamp_sec' || h === 'time_ms' || h === 'time_bin_start_ms');
    const typeIdx = header.findIndex((h) => h === 'type' || h === 'event_type');
    const sessIdx = header.findIndex((h) => h === 'session_id');

    if (timeIdx === -1) {
      throw new Error(`CSV file '${fileName}' missing required timestamp column (timestamp_sec, time_ms, or time_bin_start_ms)`);
    }

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < header.length) continue;

      const rawTime = parseFloat(parts[timeIdx]);
      if (isNaN(rawTime) || rawTime < 0) {
        throw new Error(`CSV row ${i + 1}: Invalid numeric timestamp '${parts[timeIdx]}'`);
      }

      const timestampSec = header[timeIdx].includes('ms') ? rawTime / 1000 : rawTime;
      const eventType = typeIdx !== -1 && parts[typeIdx] ? parts[typeIdx] : 'touch';
      const sessionId = sessIdx !== -1 && parts[sessIdx] ? parts[sessIdx] : 'S_DEFAULT';

      detectedSessionId = sessionId;
      events.push({
        event_id: `csv_e_${i}`,
        session_id: sessionId,
        timestamp_sec: timestampSec,
        type: eventType as any,
      });
    }
  }

  if (events.length === 0) {
    throw new Error(`No valid interaction events extracted from '${fileName}'`);
  }

  // Strictly sort chronologically (monotonic ordering)
  events.sort((a, b) => a.timestamp_sec - b.timestamp_sec);

  const durationSec = Math.max(1, Math.ceil(events[events.length - 1].timestamp_sec));
  const inputMode: InputMode = fileName.includes('sim') || fileName.includes('demo')
    ? 'simulated_session'
    : 'recorded_session';

  return {
    sessionId: detectedSessionId,
    durationSec,
    events,
    source: isJsonl ? 'jsonl' : 'csv',
    inputMode,
  };
}

export async function loadSession(file: File): Promise<LoadedSession> {
  const text = await file.text();
  return parseSessionEvents(text, file.name);
}
