import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "./fetch-all";

/**
 * Data layer for the Assessment / Question / Clicker modules.
 *
 * Relationship chain: School → Assessment → Questions → Clicker responses.
 * Assessments are keyed by a human-readable `assessment_id` (e.g. "ASM-0001");
 * questions and clicker rows reference that business key so imported sheets can
 * be matched without a UUID lookup.
 */

export const EXAM_TYPE_OPTIONS = ["ICA", "IMF", "FCA"] as const;
export const ASSESSMENT_STATUS_OPTIONS = ["Draft", "Scheduled", "Active", "Completed"] as const;
export const ANSWER_OPTIONS = ["A", "B", "C", "D"] as const;

export type Assessment = {
  id: string;
  assessment_id: string;
  exam_type: string;
  name: string;
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
  correct_answer: string;
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
  student_name: string;
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

export async function fetchAssessments(): Promise<Assessment[]> {
  return fetchAllRows<Assessment>((from, to) =>
    supabase
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to) as never,
  );
}

export async function fetchQuestions(assessmentId?: string): Promise<Question[]> {
  return fetchAllRows<Question>((from, to) => {
    let q = supabase.from("questions").select("*").order("question_no");
    if (assessmentId && assessmentId !== "all") q = q.eq("assessment_id", assessmentId);
    return q.range(from, to) as never;
  });
}

export async function fetchClickerRecords(assessmentId?: string): Promise<ClickerRecord[]> {
  const rows = await fetchAllRows<Omit<ClickerRecord, "answers"> & { answers: unknown }>(
    (from, to) => {
      let q = supabase
        .from("clicker_records")
        .select("*")
        .order("ranking", { nullsFirst: false });
      if (assessmentId && assessmentId !== "all") q = q.eq("assessment_id", assessmentId);
      return q.range(from, to) as never;
    },
  );
  return rows.map((r) => ({
    ...r,
    answers: (r.answers && typeof r.answers === "object"
      ? (r.answers as Record<string, string>)
      : {}) as Record<string, string>,
  }));
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

/**
 * Clicker sheets can hold any number of question columns (S1 … S200+), so the
 * column set is derived from the data instead of being hard-coded.
 */
export function clickerQuestionColumns(rows: ClickerRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.answers)) keys.add(k);
  return [...keys].sort((a, b) => {
    const na = Number(a.replace(/\D/g, ""));
    const nb = Number(b.replace(/\D/g, ""));
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
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
