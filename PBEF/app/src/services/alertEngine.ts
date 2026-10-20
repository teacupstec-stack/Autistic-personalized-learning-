/**
 * alertEngine.ts
 * ==============
 * PBEF Component 3 — Educator Alert State Machine
 * Manages consecutive prediction thresholds, notification cooldowns,
 * and state transitions (monitoring, elevated_risk, advisory_active, cooldown, insufficient_data).
 * 
 * Continuous Detection Design:
 * - After an advisory is acknowledged/dismissed, enters a SHORT cooldown (10s)
 * - After cooldown expires, returns to monitoring for continuous detection
 * - Multiple advisories can trigger in a single session
 */

export type AlertStatus =
  | 'monitoring'
  | 'elevated_risk'
  | 'advisory_active'
  | 'insufficient_data'
  | 'cooldown';

export interface AlertConfig {
  threshold: number;
  consecutivePredictions: number;
  cooldownSec: number;
}

export interface AlertState {
  status: AlertStatus;
  consecutiveHighRisk: number;
  lastAlertAt: number | null;
  totalAdvisories: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  threshold: 0.30,
  consecutivePredictions: 3,
  cooldownSec: 10,  // Reduced from 30s to 10s for responsive continuous detection
};

export function createInitialAlertState(): AlertState {
  return {
    status: 'monitoring',
    consecutiveHighRisk: 0,
    lastAlertAt: null,
    totalAdvisories: 0,
  };
}

export function updateAlertState(
  previous: AlertState,
  probability: number | null,
  timestampSec: number,
  valid: boolean,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): AlertState {
  if (
    !valid ||
    probability === null ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    return {
      ...previous,
      status: 'insufficient_data',
      consecutiveHighRisk: 0,
    };
  }

  const inCooldown =
    previous.lastAlertAt !== null &&
    timestampSec - previous.lastAlertAt < config.cooldownSec;

  // When cooldown expires, automatically return to monitoring (continuous detection)
  if (previous.status === 'cooldown' && !inCooldown) {
    // Cooldown has expired — re-enter monitoring and evaluate current prediction
    const highRisk = probability >= config.threshold;
    return {
      status: highRisk ? 'elevated_risk' : 'monitoring',
      consecutiveHighRisk: highRisk ? 1 : 0,
      lastAlertAt: previous.lastAlertAt,
      totalAdvisories: previous.totalAdvisories,
    };
  }

  if (inCooldown) {
    return {
      ...previous,
      status: 'cooldown',
      consecutiveHighRisk: 0,
    };
  }

  const highRisk = probability >= config.threshold;
  const count = highRisk ? previous.consecutiveHighRisk + 1 : 0;

  if (count >= config.consecutivePredictions) {
    return {
      status: 'advisory_active',
      consecutiveHighRisk: count,
      lastAlertAt: timestampSec,
      totalAdvisories: previous.totalAdvisories + 1,
    };
  }

  return {
    status: highRisk ? 'elevated_risk' : 'monitoring',
    consecutiveHighRisk: count,
    lastAlertAt: previous.lastAlertAt,
    totalAdvisories: previous.totalAdvisories,
  };
}

export function acknowledgeAlert(previous: AlertState, timestampSec: number): AlertState {
  return {
    status: 'cooldown',
    consecutiveHighRisk: 0,
    lastAlertAt: timestampSec,
    totalAdvisories: previous.totalAdvisories,
  };
}

export function dismissAlert(previous: AlertState, timestampSec: number): AlertState {
  return {
    status: 'cooldown',
    consecutiveHighRisk: 0,
    lastAlertAt: timestampSec,
    totalAdvisories: previous.totalAdvisories,
  };
}
