import { getAccessToken } from "./app-access";
import { getAcademicYear } from "./academic-year";
import {
  listExamTypes,
  listUniversalQuestions,
  writeUniversalQuestions,
  manageExamType,
  legacyQuestionIssues,
  promoteLegacySet,
} from "./question-bank.functions";
export type ExamType = { name: string; visible: boolean };
export type BankQuestion = {
  id: string;
  exam_type: string;
  class: string;
  question_no: number;
  question_text: string | null;
  correct_answer: string;
  parameter: string | null;
  chapter: string | null;
  topic: string | null;
  subject: string | null;
  marks: number;
  difficulty: string;
  created_at: string;
  updated_at: string;
};
export const normalizeClass = (value: unknown) => {
  const v = String(value ?? "")
    .trim()
    .replace(/^class\s*/i, "")
    .trim()
    .toUpperCase();
  return /^\d+$/.test(v) ? String(Number(v)) : v;
};
export const normalizeExam = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
export const bankKey = (exam: unknown, cls: unknown, no: unknown) =>
  JSON.stringify([normalizeExam(exam), normalizeClass(cls), Number(no)]);
export function answerColumn(value: string) {
  const m = /^(?:(\d+)-)?S([1-9]\d*)$/i.exec(value.trim());
  if (!m || (m[1] && Number(m[1]) !== Number(m[2]))) return null;
  return `S${Number(m[2])}`;
}
export const fetchExamTypes = () => listExamTypes({ data: { token: getAccessToken() } });
export const fetchBankQuestions = (examType = "", className = "") =>
  listUniversalQuestions({
    data: { token: getAccessToken(), academicYear: getAcademicYear(), examType, className },
  });
export const saveBankQuestions = (rows: Record<string, unknown>[], ids: string[] = []) =>
  writeUniversalQuestions({
    data: {
      token: getAccessToken(),
      academicYear: getAcademicYear(),
      mode: ids.length ? "update" : "insert",
      rows,
      ids,
    },
  });
export async function deleteBankQuestions(ids: string[]) {
  for (let start = 0; start < ids.length; start += 500)
    await writeUniversalQuestions({
      data: {
        token: getAccessToken(),
        academicYear: getAcademicYear(),
        mode: "delete",
        rows: [],
        ids: ids.slice(start, start + 500),
      },
    });
  return { ok: true };
}
export const saveExamType = (name: string, visible?: boolean) =>
  manageExamType({ data: { token: getAccessToken(), name, visible } });
export const fetchLegacyIssues = () => legacyQuestionIssues({ data: { token: getAccessToken() } });
export const promoteLegacyQuestions = (assessmentId: string) =>
  promoteLegacySet({ data: { token: getAccessToken(), assessmentId } });
