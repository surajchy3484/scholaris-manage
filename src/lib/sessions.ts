import { getAccessToken } from "./app-access";
import {
  deleteSessions,
  insertSessions,
  listDivisionSessions,
  listSessions,
  sessionUnitCounts,
  setDivisionStatus,
  updateSessions,
} from "./sessions.functions";

/**
 * Data layer for the Session Status module.
 *
 * Session *master* rows live at School → Unit → Class. Every division of that
 * class shares the same session list; completion is tracked separately per
 * division in `session_division_status`.
 */

export const UNITS = ["Unit-1", "Unit-2", "Unit-3", "Unit-4"] as const;
export type Unit = (typeof UNITS)[number];

export const DIVISIONS = ["A", "B", "C", "D", "E", "F"] as const;
export type Division = (typeof DIVISIONS)[number];

export const SESSION_STATUSES = ["pending", "complete"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type SessionMaster = {
  id: string;
  school_id: string;
  unit: Unit;
  session_name: string;
  class: string;
  topic: string;
  created_at: string;
};

/** A master session paired with the status of the selected division. */
export type DivisionSession = {
  id: string;
  school_id: string;
  unit: Unit;
  session_name: string;
  class: string;
  topic: string;
  division: string;
  status: SessionStatus;
  updated_at: string | null;
  updated_by: string | null;
};

export type NewSession = {
  school_id: string;
  unit: Unit;
  session_name: string;
  class: string;
  topic: string;
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

/** Strips a leading "Class " so sheets and manual entry agree. */
export function normalizeClass(value: string): string {
  return value.trim().replace(/^class\s*/i, "").trim();
}

export async function fetchSessions(
  schoolId?: string,
  opts?: { unit?: Unit; klass?: string },
): Promise<SessionMaster[]> {
  const rows = await listSessions({
    data: {
      token: getAccessToken(),
      ...(schoolId ? { schoolId } : {}),
      ...(opts?.unit ? { unit: opts.unit } : {}),
      ...(opts?.klass ? { class: opts.klass } : {}),
    },
  });
  return rows as SessionMaster[];
}

export async function fetchDivisionSessions(args: {
  schoolId: string;
  unit: Unit;
  klass: string;
  division: string;
}): Promise<DivisionSession[]> {
  const rows = await listDivisionSessions({
    data: {
      token: getAccessToken(),
      schoolId: args.schoolId,
      unit: args.unit,
      class: args.klass,
      division: args.division,
    },
  });
  return rows as DivisionSession[];
}

export async function fetchUnitCounts(schoolId: string) {
  return sessionUnitCounts({ data: { token: getAccessToken(), schoolId } });
}

export async function createSessions(rows: NewSession[]) {
  return insertSessions({ data: { token: getAccessToken(), rows } });
}

export async function patchSessions(ids: string[], patch: Partial<NewSession>) {
  return updateSessions({ data: { token: getAccessToken(), ids, patch } });
}

export async function setSessionStatus(args: {
  schoolId: string;
  unit: Unit;
  klass: string;
  division: string;
  ids: string[];
  status: SessionStatus;
}) {
  return setDivisionStatus({
    data: {
      token: getAccessToken(),
      schoolId: args.schoolId,
      unit: args.unit,
      class: args.klass,
      division: args.division,
      ids: args.ids,
      status: args.status,
    },
  });
}

export async function removeSessions(ids: string[]) {
  return deleteSessions({ data: { token: getAccessToken(), ids } });
}

/** Completed ÷ total × 100, rounded to a whole percent. */
export function unitProgress(rows: { status: SessionStatus }[]) {
  const total = rows.length;
  const complete = rows.filter((r) => r.status === "complete").length;
  return {
    total,
    complete,
    pending: total - complete,
    percent: total ? Math.round((complete / total) * 100) : 0,
  };
}
