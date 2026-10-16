/**
 * @file event_logger.ts
 * @description Client-side monotonic event logger for Component 3 (Participation Forecasting - PBEF).
 * Captures interaction dynamics (touch, latency, prompts, activity changes, pauses)
 * and optional masked visual cues synchronized to the session monotonic clock.
 *
 * INPUTS:
 *  - learner_id: Pseudonymous identifier (e.g. "L001")
 *  - session_id: Session identifier (e.g. "S20261016_01")
 *  - Interaction events (clicks, touches, responses, latencies, hints)
 *  - Optional camera feature vectors (head yaw, pitch, presence) + validity flags
 *
 * OUTPUTS:
 *  - In-memory event stream
 *  - Serialized JSONL / CSV event log conforming to docs/DATA_CONTRACT.md
 *  - Session summary statistics (duration, event counts, latency averages)
 */

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'activity_start'
  | 'activity_end'
  | 'stimulus_presented'
  | 'touch_down'
  | 'touch_up'
  | 'response'
  | 'hint_requested'
  | 'hint_delivered'
  | 'idle_pause'
  | 'visual_frame';

export interface VisualFeatures {
  head_pose_yaw?: number;
  head_pose_pitch?: number;
  face_present: boolean;
  is_valid: boolean;
}

export interface InteractionEvent {
  learner_id: string;
  session_id: string;
  time_ms: number; // Monotonic offset from session start in ms
  event_type: EventType;
  activity_id: string;
  response_latency_ms?: number | null;
  prompt_count: number;
  accuracy?: number | null; // 1 = correct, 0 = incorrect, null = n/a
  touch_x?: number | null;   // Normalized screen coordinate [0.0 - 1.0]
  touch_y?: number | null;   // Normalized screen coordinate [0.0 - 1.0]
  pause_before_action_ms?: number | null;
  visual_features?: VisualFeatures | null;
  metadata?: Record<string, unknown>;
}

export interface SessionConfig {
  learner_id: string;
  session_id: string;
  activity_id: string;
  onFlush?: (events: InteractionEvent[]) => Promise<void> | void;
  flushIntervalMs?: number;
  flushMode?: 'incremental' | 'snapshot'; // Default: 'incremental'
}

export class SessionEventLogger {
  private learnerId: string;
  private sessionId: string;
  private currentActivityId: string;
  private sessionStartTime: number | null = null;
  private lastActionTime: number | null = null;
  private lastStimulusTime: number | null = null;
  private currentStimulusId: string | null = null;
  private promptCount = 0;
  private events: InteractionEvent[] = [];
  private isSessionActive = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private onFlush?: (events: InteractionEvent[]) => Promise<void> | void;
  private flushMode: 'incremental' | 'snapshot';
  private lastFlushedIndex = 0;

  constructor(config: SessionConfig) {
    this.learnerId = config.learner_id;
    this.sessionId = config.session_id;
    this.currentActivityId = config.activity_id;
    this.onFlush = config.onFlush;
    this.flushMode = config.flushMode ?? 'incremental';

    if (config.flushIntervalMs && config.flushIntervalMs > 0 && config.onFlush) {
      this.flushTimer = setInterval(() => {
        if (this.isSessionActive && this.events.length > this.lastFlushedIndex) {
          this.flush();
        }
      }, config.flushIntervalMs);
    }
  }

  /**
   * Monotonic clock helper: returns elapsed ms since session start.
   */
  public getElapsedSessionMs(): number {
    if (!this.sessionStartTime) return 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return Math.max(0, Math.round(now - this.sessionStartTime));
  }

  /**
   * Starts a new session timeline at t_0 = 0.
   */
  public startSession(): InteractionEvent {
    this.sessionStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastActionTime = this.sessionStartTime;
    this.isSessionActive = true;
    this.promptCount = 0;

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: 0,
      event_type: 'session_start',
      activity_id: this.currentActivityId,
      prompt_count: 0,
      response_latency_ms: null,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: null,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Transition to a new activity within the active session.
   */
  public setActivity(activityId: string): InteractionEvent {
    this.currentActivityId = activityId;
    const elapsed = this.getElapsedSessionMs();
    this.lastStimulusTime = null;

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: 'activity_start',
      activity_id: activityId,
      prompt_count: this.promptCount,
      response_latency_ms: null,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: null,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Mark stimulus onset to enable accurate response latency tracking.
   */
  public logStimulusPresented(stimulusId?: string): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();
    this.lastStimulusTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.currentStimulusId = stimulusId ?? `stim_${elapsed}`;

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: 'stimulus_presented',
      activity_id: this.currentActivityId,
      prompt_count: this.promptCount,
      response_latency_ms: null,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: null,
      metadata: { stimulus_id: this.currentStimulusId },
    };

    this.events.push(event);
    return event;
  }

  /**
   * Logs a learner response action (touch, selection, drag drop completion).
   * Consumes active stimulus timestamp so subsequent touches do not inherit stale latency.
   */
  public logResponse(params: {
    isCorrect?: boolean | null;
    touchX?: number | null;
    touchY?: number | null;
    explicitLatencyMs?: number | null;
    visualFeatures?: VisualFeatures | null;
    metadata?: Record<string, unknown>;
  }): InteractionEvent {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = this.getElapsedSessionMs();

    // Calculate latency from stimulus presentation if available
    let latency: number | null = null;
    if (params.explicitLatencyMs !== undefined && params.explicitLatencyMs !== null) {
      latency = params.explicitLatencyMs;
    } else if (this.lastStimulusTime !== null) {
      latency = Math.max(0, Math.round(now - this.lastStimulusTime));
      // Consume stimulus: clear timestamp and ID to prevent subsequent touches from inheriting stale latency
      this.lastStimulusTime = null;
    }

    // Calculate hesitation/pause time since last action
    const pauseBeforeAction = this.lastActionTime !== null
      ? Math.max(0, Math.round(now - this.lastActionTime))
      : null;
    this.lastActionTime = now;

    const eventMetadata = {
      ...params.metadata,
      ...(this.currentStimulusId ? { stimulus_id: this.currentStimulusId } : {}),
    };
    this.currentStimulusId = null;

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: 'response',
      activity_id: this.currentActivityId,
      response_latency_ms: latency,
      prompt_count: this.promptCount,
      accuracy: params.isCorrect === true ? 1 : params.isCorrect === false ? 0 : null,
      touch_x: params.touchX ?? null,
      touch_y: params.touchY ?? null,
      pause_before_action_ms: pauseBeforeAction,
      visual_features: params.visualFeatures ?? null,
      metadata: Object.keys(eventMetadata).length > 0 ? eventMetadata : undefined,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Logs touch events (touch_down or touch_up) to observe motor patterns.
   */
  public logTouch(type: 'touch_down' | 'touch_up', touchX?: number, touchY?: number): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pause = this.lastActionTime !== null ? Math.round(now - this.lastActionTime) : null;
    this.lastActionTime = now;

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: type,
      activity_id: this.currentActivityId,
      response_latency_ms: null,
      prompt_count: this.promptCount,
      accuracy: null,
      touch_x: touchX ?? null,
      touch_y: touchY ?? null,
      pause_before_action_ms: pause,
      visual_features: null,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Record hints/prompts requested or provided to the learner.
   */
  public logPrompt(type: 'hint_requested' | 'hint_delivered', promptType?: string): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();
    if (type === 'hint_delivered') {
      this.promptCount += 1;
    }

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: type,
      activity_id: this.currentActivityId,
      response_latency_ms: null,
      prompt_count: this.promptCount,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: null,
      metadata: promptType ? { prompt_type: promptType } : undefined,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Log periodic visual frame features (camera features with validity masks).
   */
  public logVisualFrame(features: VisualFeatures): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: 'visual_frame',
      activity_id: this.currentActivityId,
      response_latency_ms: null,
      prompt_count: this.promptCount,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: features,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Concludes the session and records session_end.
   */
  public endSession(): InteractionEvent {
    const elapsed = this.getElapsedSessionMs();
    this.isSessionActive = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    const event: InteractionEvent = {
      learner_id: this.learnerId,
      session_id: this.sessionId,
      time_ms: elapsed,
      event_type: 'session_end',
      activity_id: this.currentActivityId,
      response_latency_ms: null,
      prompt_count: this.promptCount,
      accuracy: null,
      touch_x: null,
      touch_y: null,
      pause_before_action_ms: null,
      visual_features: null,
    };

    this.events.push(event);
    if (this.onFlush) {
      this.flush();
    }
    return event;
  }

  public getEvents(): ReadonlyArray<InteractionEvent> {
    return this.events;
  }

  public async flush(): Promise<void> {
    if (!this.onFlush) return;

    if (this.flushMode === 'snapshot') {
      if (this.events.length > 0) {
        await this.onFlush([...this.events]);
      }
    } else {
      // Incremental mode: only emit newly recorded events to prevent duplicate uploads
      if (this.lastFlushedIndex < this.events.length) {
        const batch = this.events.slice(this.lastFlushedIndex);
        this.lastFlushedIndex = this.events.length;
        await this.onFlush(batch);
      }
    }
  }

  /**
   * Serializes all recorded events to JSON Lines (JSONL).
   */
  public toJsonLines(): string {
    return this.events.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Serializes recorded events to standard CSV format.
   */
  public toCsv(): string {
    const headers = [
      'learner_id',
      'session_id',
      'time_ms',
      'event_type',
      'activity_id',
      'response_latency_ms',
      'prompt_count',
      'accuracy',
      'touch_x',
      'touch_y',
      'pause_before_action_ms',
      'visual_valid',
      'face_present',
      'head_yaw',
      'head_pitch',
    ];

    const rows = this.events.map((e) => [
      e.learner_id,
      e.session_id,
      e.time_ms,
      e.event_type,
      e.activity_id,
      e.response_latency_ms ?? '',
      e.prompt_count,
      e.accuracy ?? '',
      e.touch_x !== null && e.touch_x !== undefined ? e.touch_x.toFixed(4) : '',
      e.touch_y !== null && e.touch_y !== undefined ? e.touch_y.toFixed(4) : '',
      e.pause_before_action_ms ?? '',
      e.visual_features?.is_valid ? 1 : 0,
      e.visual_features?.face_present ? 1 : 0,
      e.visual_features?.head_pose_yaw !== undefined ? e.visual_features.head_pose_yaw.toFixed(2) : '',
      e.visual_features?.head_pose_pitch !== undefined ? e.visual_features.head_pose_pitch.toFixed(2) : '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
