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
 * Relationship chain: School → Assessment → Questions → Clicker responses.
 * Assessments are keyed by a human-readable `assessment_id` (e.g. "ASM-0001");
 * questions and clicker rows reference that business key so imported sheets can
 * be matched without a UUID lookup.
 */

export const EXAM_TYPE_OPTIONS = ["ICA", "MCA", "FCA"] as const;
export const ASSESSMENT_STATUS_OPTIONS = ["Draft", "Scheduled", "Active", "Completed"] as const;
export const ANSWER_OPTIONS = ["A", "B", "C", "D"] as const;
export const DIFFICULTY_OPTIONS = ["Easy", "Medium", "Hard"] as const;
export const QUESTION_STATUS_OPTIONS = ["Active", "Inactive"] as const;

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

/** Calculate a result from the Assessment/Question Master answer key. */
export function calculateClickerMetrics(
  answers: Record<string, string>,
  questions: Question[],
  fallback?: { score?: number; correct_rate?: number },
): ClickerMetrics {
  const key = new Map(questions.map((q) => [`S${q.question_no}`, q.correct_answer.toUpperCase()]));
  const questionKeys = [...key.keys()];
  if (questionKeys.length === 0) {
    const score = Number(fallback?.score ?? 0);
    const correctRate = Number(fallback?.correct_rate ?? 0);
    return {
      score,
      correct_rate: correctRate,
      correct_answers: Math.round((correctRate / 100) * questionKeys.length),
      wrong_answers: 0,
    };
  }
  let correct = 0;
  for (const question of questionKeys) {
    if ((answers[question] ?? "").toUpperCase() === key.get(question)) correct += 1;
  }
  return {
    score: correct,
    correct_rate: Math.round((correct / questionKeys.length) * 1000) / 10,
    correct_answers: correct,
    wrong_answers: questionKeys.length - correct,
  };
}

/** Competition ranking: 1, 2, 2, 4, grouped by assessment/class/section. */
export function applyCompetitionRanking<T extends {
  assessment_id: string | null;
  class: string | null;
  section: string | null;
  score: number;
  ranking: number | null;
}>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.assessment_id ?? ""}|${row.class ?? ""}|${row.section ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => b.score - a.score);
    let previousScore: number | null = null;
    let rank = 0;
    sorted.forEach((row, index) => {
      if (row.score !== previousScore) rank = index + 1;
      row.ranking = rank;
      previousScore = row.score;
    });
  }
  return rows;
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

/** Score / correct-rate / ranking recomputed from the answer key of an assessment. */
export function scoreClickerRows(
  rows: ClickerRecord[],
  key: Map<number, string>,
): ClickerRecord[] {
  if (key.size === 0) return rows;
  const scored = rows.map((r) => {
    let correct = 0;
    let answered = 0;
    for (const [col, val] of Object.entries(r.answers)) {
      const no = Number(col.replace(/\D/g, ""));
      const expected = key.get(no);
      if (!expected) continue;
      answered += 1;
      if (String(val).trim().toUpperCase() === expected.toUpperCase()) correct += 1;
    }
    const rate = answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0;
    return { ...r, score: correct, correct_rate: rate };
  });
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => {
    r.ranking = i + 1;
  });
  return scored;
}
