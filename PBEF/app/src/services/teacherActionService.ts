/**
 * teacherActionService.ts
 * =======================
 * PBEF Component 3 — Educator Intervention & Decision Audit Service
 * Records, manages, and exports teacher-selected pedagogical support actions.
 */

import { TeacherAction } from '../types/participation';

export class TeacherActionService {
  private actions: TeacherAction[] = [];

  public logAction(
    sessionId: string,
    timestampSec: number,
    type: TeacherAction['type'],
    note?: string
  ): TeacherAction {
    const action: TeacherAction = {
      action_id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      session_id: sessionId,
      timestamp_sec: timestampSec,
      type,
      note,
    };
    this.actions.unshift(action);
    return action;
  }

  public getActions(sessionId?: string): TeacherAction[] {
    if (sessionId) {
      return this.actions.filter((a) => a.session_id === sessionId);
    }
    return [...this.actions];
  }

  public clearActions(): void {
    this.actions = [];
  }

  public exportAuditJson(): string {
    return JSON.stringify(this.actions, null, 2);
  }
}

export const teacherActionService = new TeacherActionService();
