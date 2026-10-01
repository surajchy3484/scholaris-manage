import { getAcademicYear } from "@/lib/academic-year";
import { getAccessToken } from "./app-access";
import {
  listSessionSchools,
  listSessionRoster,
  deleteSessions,
  insertSessions,
  listDivisionSessions,
  listSessions,
  listAssignmentContext,
  previewClassAssignment,
  applyClassAssignment,
  overrideAssignmentTarget,
  applySchoolAssignment,
  importSessionsToEligibleSchools,
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
  const v = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^unit-?/, "");
  const match = UNITS.find((u) => u.toLowerCase().endsWith(v));
  return match ?? null;
}

/** Strips a leading "Class " so sheets and manual entry agree. */
export function normalizeClass(value: string): string {
  return value
    .trim()
    .replace(/^class\s*/i, "")
    .trim();
}

export async function fetchSessions(
  schoolId?: string,
  opts?: { unit?: Unit; klass?: string },
): Promise<SessionMaster[]> {
  const rows = await listSessions({
    data: {
      token: getAccessToken(),
      academicYear: getAcademicYear(),
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
      academicYear: getAcademicYear(),
      schoolId: args.schoolId,
      unit: args.unit,
      class: args.klass,
      division: args.division,
    },
  });
  return rows as DivisionSession[];
}

export async function fetchUnitCounts(schoolId: string) {
  return sessionUnitCounts({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), schoolId },
  });
}

export async function createSessions(rows: NewSession[]) {
  return insertSessions({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), rows },
  });
}

export async function importSessionsForSchools(args: {
  academicYear: string;
  unit: Unit;
  schoolIds?: string[];
  updateExisting?: boolean;
  rows: {
    class: string;
    session_name: string;
    topic: string;
    division: string;
    status: SessionStatus;
  }[];
}) {
  return importSessionsToEligibleSchools({
    data: {
      token: getAccessToken(),
      academicYear: args.academicYear,
      unit: args.unit,
      ...(args.schoolIds?.length ? { schoolIds: args.schoolIds } : {}),
      updateExisting: args.updateExisting ?? false,
      rows: args.rows,
    },
  });
}

export async function patchSessions(ids: string[], patch: Partial<NewSession>) {
  return updateSessions({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), ids, patch },
  });
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
      academicYear: getAcademicYear(),
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
  return deleteSessions({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), ids },
  });
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

export const fetchSessionSchools = () =>
  listSessionSchools({ data: { token: getAccessToken(), academicYear: getAcademicYear() } });
export const fetchSessionRoster = (schoolId: string) =>
  listSessionRoster({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), schoolId },
  });

export const fetchAssignmentContext = () =>
  listAssignmentContext({ data: { token: getAccessToken(), academicYear: getAcademicYear() } });
export const previewClassPlan = (args: {
  academicYear: string;
  unit: Unit;
  klass: string;
  sessionCount: number;
}) =>
  previewClassAssignment({
    data: {
      token: getAccessToken(),
      academicYear: args.academicYear,
      unit: args.unit,
      class: args.klass,
      sessionCount: args.sessionCount,
    },
  });
export const applyClassPlan = (args: {
  academicYear: string;
  unit: Unit;
  klass: string;
  sessionCount: number;
}) =>
  applyClassAssignment({
    data: {
      token: getAccessToken(),
      academicYear: args.academicYear,
      unit: args.unit,
      class: args.klass,
      sessionCount: args.sessionCount,
    },
  });
export const overrideClassPlan = (args: {
  academicYear: string;
  schoolId: string;
  unit: Unit;
  klass: string;
  division?: string;
  sessionCount: number;
}) =>
  overrideAssignmentTarget({
    data: {
      token: getAccessToken(),
      academicYear: args.academicYear,
      schoolId: args.schoolId,
      unit: args.unit,
      class: args.klass,
      division: args.division ?? "",
      sessionCount: args.sessionCount,
    },
  });
export const applySchoolPlan = (args: {
  academicYear: string;
  schoolId: string;
  unit: Unit;
  klass: string;
  division?: string;
  sessionCount: number;
}) =>
  applySchoolAssignment({
    data: {
      token: getAccessToken(),
      academicYear: args.academicYear,
      schoolId: args.schoolId,
      unit: args.unit,
      class: args.klass,
      division: args.division ?? "",
      sessionCount: args.sessionCount,
    },
  });
