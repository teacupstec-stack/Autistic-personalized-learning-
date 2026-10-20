/**
 * eventMapping.ts
 * ===============
 * PBEF Component 3 — Canonical Telemetry to Session Event Converter
 * 
 * Maps InteractionEvent (emitted by SessionEventLogger) into SessionEvent (consumed by
 * eventFeatureAdapter and the teacher monitoring dashboard).
 * 
 * Guarantees:
 *  - Responses are counted once (answer_submitted). Correctness is stored in metadata, not double-counted.
 *  - Accurate monotonic timestamp conversion from milliseconds to seconds.
 *  - Explicit pause events and answer selection are preserved as contextual telemetry.
 */

import type { InteractionEvent } from '../event_logger';
import type { SessionEvent, SessionEventType } from '../types/participation';

const EVENT_TYPE_MAP: Partial<Record<string, SessionEventType>> = {
  response: 'answer_submitted',
  stimulus_presented: 'stimulus_presented',
  answer_selected: 'answer_selected',
  hint_requested: 'hint_requested',
  hint_delivered: 'hint_delivered',
  activity_start: 'task_started',
  activity_end: 'task_completed',
  idle_pause: 'idle_pause',
  touch_down: 'touch',
};

export function toSessionEvent(event: InteractionEvent): SessionEvent | null {
  const type = EVENT_TYPE_MAP[event.event_type];
  if (!type) return null;

  return {
    event_id: `${event.session_id}:${event.time_ms}:${event.event_type}`,
    session_id: event.session_id,
    timestamp_sec: parseFloat((event.time_ms / 1000).toFixed(3)),
    type,
    task_id: event.activity_id,
    metadata: {
      ...(event.response_latency_ms != null ? { latencyMs: event.response_latency_ms } : {}),
      ...(event.accuracy != null ? { isCorrect: event.accuracy === 1 } : {}),
      ...(event.pause_before_action_ms != null ? { pauseBeforeActionMs: event.pause_before_action_ms } : {}),
      ...(event.metadata ? (event.metadata as Record<string, string | number | boolean>) : {}),
    },
  };
}

export function toSessionEvents(events: InteractionEvent[]): SessionEvent[] {
  const result: SessionEvent[] = [];
  for (const e of events) {
    const mapped = toSessionEvent(e);
    if (mapped) {
      result.push(mapped);
    }
  }
  return result.sort((a, b) => a.timestamp_sec - b.timestamp_sec);
}
