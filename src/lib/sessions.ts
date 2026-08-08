import { getAccessToken } from "./app-access";
import {
  deleteSessions,
  insertSessions,
  listSessions,
  updateSessions,
} from "./sessions.functions";

/**
 * Data layer for the Session Status module.
 *
 * A session always belongs to one School → Unit → Class → Division scope, so
 * the same session name can exist independently in every unit.
 */

export const UNITS = ["Unit-1", "Unit-2", "Unit-3", "Unit-4"] as const;
export type Unit = (typeof UNITS)[number];

export const SESSION_STATUSES = ["pending", "complete"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type SessionRow = {
  id: string;
  school_id: string;
  unit: Unit;
  session_name: string;
  class: string;
  division: string;
  topic: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
};

export type NewSession = {
  school_id: string;
  unit: Unit;
  session_name: string;
  class: string;
  division: string;
  topic: string;
  status: SessionStatus;
};

export function normalizeStatus(value: string): SessionStatus | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "pending") return "pending";
  if (v === "complete" || v === "completed" || v === "done") return "complete";
  return null;
}

export function normalizeUnit(value: string): Unit | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, "").replace(/^unit-?/, "");
  const match = UNITS.find((u) => u.toLowerCase().endsWith(v));
  return match ?? null;
}

export async function fetchSessions(schoolId?: string): Promise<SessionRow[]> {
  const rows = await listSessions({
    data: { token: getAccessToken(), ...(schoolId ? { schoolId } : {}) },
  });
  return rows as SessionRow[];
}

export async function createSessions(rows: NewSession[]) {
  return insertSessions({ data: { token: getAccessToken(), rows } });
}

export async function patchSessions(ids: string[], patch: Partial<NewSession>) {
  return updateSessions({ data: { token: getAccessToken(), ids, patch } });
}

export async function removeSessions(ids: string[]) {
  return deleteSessions({ data: { token: getAccessToken(), ids } });
}

/** Completed ÷ total × 100, rounded to a whole percent. */
export function unitProgress(rows: SessionRow[]) {
  const total = rows.length;
  const complete = rows.filter((r) => r.status === "complete").length;
  return {
    total,
    complete,
    pending: total - complete,
    percent: total ? Math.round((complete / total) * 100) : 0,
  };
}
