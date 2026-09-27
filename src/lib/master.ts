import { getAccessToken } from "./app-access";
import {
  deleteMasterRows,
  insertMasterRows,
  listMasterRows,
  updateMasterRows,
} from "./master.functions";

/**
 * Data layer for the Assessment / Question / Clicker modules.
 *
 * School → Assessment supplies session context. Universal Exam Type + Class + Question Number supplies the answer key.
 * Assessments are keyed by a human-readable `assessment_id` (e.g. "ASM-0001");
 * questions and clicker rows reference that business key so imported sheets can
 * be matched without a UUID lookup.
 */

export const ASSESSMENT_STATUS_OPTIONS = ["Draft", "Scheduled", "Active", "Completed"] as const;
export const ANSWER_OPTIONS = ["A", "B", "C", "D"] as const;

export type Assessment = {
  id: string;
  assessment_id: string;
  exam_type: string;
  name: string;
  academic_year: string;
  subject: string | null;
  total_marks: number;
  passing_marks: number;
  date: string | null;
  school_id: string | null;
  school_name: string | null;
  class: string | null;
  section: string | null;
  total_questions: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Question = {
  exam_type?: string;
  class?: string;
  id: string;
  assessment_id: string;
  question_no: number;
  question_text: string | null;
  correct_answer: string;
  marks: number;
  difficulty: string;
  status: string;
  subject: string | null;
  parameter: string | null;
  topic: string | null;
  chapter: string | null;
  created_at: string;
  updated_at: string;
};

export type ClickerRecord = {
  exam_type?: string | null;
  total_questions?: number | null;
  attempted_questions?: number | null;
  correct_answers?: number | null;
  wrong_answers?: number | null;
  unattempted_questions?: number | null;
  question_snapshot?: Question[] | null;
  evaluated_at?: string | null;
  id: string;
  assessment_id: string | null;
  keypad_id: string;
  student_id: string | null;
  student_name: string;
  roll_number: string | null;
  school_id: string | null;
  school_name: string | null;
  class: string | null;
  section: string | null;
  team: string | null;
  score: number;
  correct_rate: number;
  ranking: number | null;
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type ClickerMetrics = {
  score: number;
  correct_rate: number;
  correct_answers: number;
  wrong_answers: number;
};

export type MasterTable = "assessments" | "questions" | "clicker_records" | "assessment_results";

async function listRows(table: MasterTable, assessmentId?: string) {
  return listMasterRows({ data: { token: getAccessToken(), table, assessmentId } });
}

export async function fetchAssessments(): Promise<Assessment[]> {
  return (await listRows("assessments")) as Assessment[];
}

export async function fetchQuestions(assessmentId?: string): Promise<Question[]> {
  return (await listRows("questions", assessmentId)) as Question[];
}

export async function fetchClickerRecords(assessmentId?: string): Promise<ClickerRecord[]> {
  const rows = (await listRows("clicker_records", assessmentId)) as ClickerRecord[];
  return rows.map((r) => ({
    ...r,
    answers: (r.answers && typeof r.answers === "object"
      ? (r.answers as Record<string, string>)
      : {}) as Record<string, string>,
  }));
}

/** Inserts rows in chunks through the privileged server function. */
export async function insertRows(
  table: MasterTable,
  rows: Record<string, unknown>[],
  chunk = 500,
): Promise<number> {
  const token = getAccessToken();
  for (let i = 0; i < rows.length; i += chunk) {
    await insertMasterRows({ data: { token, table, rows: rows.slice(i, i + chunk) } });
  }
  return rows.length;
}

export async function updateRowsByIds(
  table: MasterTable,
  ids: string[],
  patch: Record<string, unknown>,
  chunk = 200,
): Promise<void> {
  const token = getAccessToken();
  for (let i = 0; i < ids.length; i += chunk) {
    await updateMasterRows({ data: { token, table, ids: ids.slice(i, i + chunk), patch } });
  }
}

/** Next free assessment code, e.g. ASM-0007. */
export function nextAssessmentCode(existing: Assessment[]): string {
  let max = 0;
  for (const a of existing) {
    const m = /(\d+)\s*$/.exec(a.assessment_id ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ASM-${String(max + 1).padStart(4, "0")}`;
}

/** Deletes rows in chunks so bulk selections never exceed request limits. */
export async function deleteRowsByIds(
  table: MasterTable,
  ids: string[],
  chunk = 200,
): Promise<number> {
  const token = getAccessToken();
  for (let i = 0; i < ids.length; i += chunk) {
    await deleteMasterRows({ data: { token, table, ids: ids.slice(i, i + chunk) } });
  }
  return ids.length;
}

/**
 * Clicker sheets can hold any number of question columns (S1 … S200+), so the
 * column set is derived from the data instead of being hard-coded.
 */
export function clickerQuestionColumns(rows: ClickerRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.answers)) {
      const normalized = k.trim().toUpperCase();
      if (/^S\d+$/.test(normalized)) keys.add(normalized);
    }
  }
  return [...keys].sort((a, b) => {
    return Number(a.slice(1)) - Number(b.slice(1));
  });
}
