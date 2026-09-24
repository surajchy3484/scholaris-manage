import type { Assessment, ClickerRecord, Question } from "./master";
import type { StudentReport } from "./exam";

export type Thresholds = { strong: number; good: number; attention: number };
export const DEFAULT_THRESHOLDS: Thresholds = { strong: 85, good: 80, attention: 65 };
export function validThresholds(t: Thresholds) {
  return (
    [t.strong, t.good, t.attention].every(Number.isFinite) &&
    t.strong <= 100 &&
    t.strong > t.good &&
    t.good > t.attention &&
    t.attention >= 0
  );
}
export function classify(rate: number | null, t = DEFAULT_THRESHOLDS) {
  if (rate == null) return { status: "No data", priority: "Not assessed", color: "#64748b" };
  if (rate >= t.strong) return { status: "Strong", priority: "Low", color: "#059669" };
  if (rate >= t.good) return { status: "Good", priority: "Moderate", color: "#d97706" };
  if (rate >= t.attention) return { status: "Needs Attention", priority: "High", color: "#ea580c" };
  return { status: "Weak", priority: "Very High", color: "#dc2626" };
}
export const mean = (values: (number | null)[]) => {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
};
const percentage = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
const key = (...parts: unknown[]) => JSON.stringify(parts.map(norm));
export type Attempt = {
  student: StudentReport;
  assessment: Assessment;
  record: ClickerRecord;
  score: number | null;
  rate: number | null;
  rank: number | null;
  responses: { question: Question; answer: string; correct: boolean }[];
};
export type AnalyticsData = {
  students: StudentReport[];
  attempts: Attempt[];
  excluded: number;
  duplicates: number;
};

/** Unique student IDs take precedence. Unlinked imports require a unique school/class/section/roll match. */
export function prepareAnalytics(
  students: StudentReport[],
  assessments: Assessment[],
  questions: Question[],
  records: ClickerRecord[],
): AnalyticsData {
  const byId = new Map(students.map((s) => [s.id, s]));
  const byRoll = new Map<string, StudentReport[]>();
  for (const s of students) {
    const k = key(s.school_id, s.class, s.division, s.roll_number);
    const group = byRoll.get(k) ?? [];
    group.push(s);
    byRoll.set(k, group);
  }
  const assessmentMap = new Map(assessments.map((a) => [a.assessment_id, a]));
  const questionMap = new Map<string, Map<number, Question>>();
  for (const q of questions) {
    if (!/^[ABCD]$/.test(norm(q.correct_answer))) continue;
    const group = questionMap.get(q.assessment_id) ?? new Map<number, Question>();
    group.set(q.question_no, q);
    questionMap.set(q.assessment_id, group);
  }
  const latest = new Map<
    string,
    { student: StudentReport; assessment: Assessment; record: ClickerRecord }
  >();
  let excluded = 0,
    duplicates = 0;
  for (const record of records) {
    const assessment = assessmentMap.get(record.assessment_id ?? "");
    const candidates = byRoll.get(
      key(
        record.school_id ?? assessment?.school_id,
        record.class ?? assessment?.class,
        record.section ?? assessment?.section,
        record.roll_number,
      ),
    );
    const student = record.student_id
      ? byId.get(record.student_id)
      : record.roll_number && candidates?.length === 1
        ? candidates[0]
        : undefined;
    if (
      !student ||
      !assessment ||
      (record.school_id && record.school_id !== student.school_id) ||
      (assessment.school_id && assessment.school_id !== student.school_id)
    ) {
      excluded++;
      continue;
    }
    const k = key(student.id, assessment.assessment_id);
    const old = latest.get(k);
    if (old) {
      duplicates++;
      if (`${old.record.updated_at}|${old.record.id}` >= `${record.updated_at}|${record.id}`)
        continue;
    }
    latest.set(k, { student, assessment, record });
  }
  const attempts: Attempt[] = [...latest.values()].map(({ student, assessment, record }) => {
    const answers = new Map(
      Object.entries(record.answers ?? {}).map(([k, v]) => [norm(k), norm(v)]),
    );
    const qs = [...(questionMap.get(assessment.assessment_id)?.values() ?? [])];
    // Summary-only imports cannot support question-level analysis. Blank answers in a response sheet are incorrect.
    const hasResponses = qs.some((q) => answers.has(`S${q.question_no}`));
    const responses = hasResponses
      ? qs.map((question) => ({
          question,
          answer: answers.get(`S${question.question_no}`) ?? "",
          correct: answers.get(`S${question.question_no}`) === norm(question.correct_answer),
        }))
      : [];
    // Existing Clicker scoring stores a count of correct answers, not weighted marks.
    const total = assessment.total_questions > 0 ? assessment.total_questions : qs.length;
    const score =
      total > 0 && typeof record.score === "number"
        ? percentage((record.score / total) * 100)
        : null;
    return {
      student,
      assessment,
      record,
      score,
      rate: percentage(record.correct_rate),
      rank: null,
      responses,
    };
  });
  const peers = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (a.score == null) continue;
    const k = key(
      a.student.school_id,
      a.student.class,
      a.student.division,
      a.assessment.assessment_id,
    );
    const group = peers.get(k) ?? [];
    group.push(a);
    peers.set(k, group);
  }
  for (const group of peers.values()) {
    group.sort((a, b) => b.score! - a.score!);
    group.forEach((a, i) => {
      a.rank = i && a.score === group[i - 1].score ? group[i - 1].rank : i + 1;
    });
  }
  return { students, attempts, excluded, duplicates };
}
export type Summary = {
  students: number;
  assessed: number;
  assessments: number;
  score: number | null;
  rate: number | null;
};
export function summarize(students: StudentReport[], attempts: Attempt[]): Summary {
  return {
    students: students.length,
    assessed: new Set(attempts.map((a) => a.student.id)).size,
    assessments: new Set(attempts.map((a) => a.assessment.assessment_id)).size,
    score: mean(attempts.map((a) => a.score)),
    rate: mean(attempts.map((a) => a.rate)),
  };
}
export type Area = {
  name: string;
  questions: number;
  responses: number;
  correct: number;
  rate: number;
};
export type Dimension = "subject" | "parameter" | "topic" | "chapter";
export function areas(attempts: Attempt[], dimension: Dimension): Area[] {
  const groups = new Map<
    string,
    { name: string; questions: Set<string>; responses: number; correct: number }
  >();
  for (const a of attempts)
    for (const r of a.responses) {
      const subject =
        r.question.subject?.trim() || a.assessment.subject?.trim() || "Unspecified subject";
      const value =
        dimension === "subject"
          ? subject
          : r.question[dimension]?.trim() || `Unspecified ${dimension}`;
      // Keep identically named topics in different subjects/chapters distinct.
      const name =
        dimension === "topic"
          ? `${subject} / ${r.question.chapter?.trim() || "Unspecified chapter"} / ${value}`
          : dimension === "chapter"
            ? `${subject} / ${value}`
            : value;
      const k = norm(name);
      const g = groups.get(k) ?? { name, questions: new Set<string>(), responses: 0, correct: 0 };
      g.questions.add(key(a.assessment.assessment_id, r.question.question_no));
      g.responses++;
      g.correct += Number(r.correct);
      groups.set(k, g);
    }
  return [...groups.values()]
    .map((g) => ({ ...g, questions: g.questions.size, rate: (g.correct / g.responses) * 100 }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
}
export type AnalyticsView = ReturnType<typeof buildAnalyticsView>;
export function buildAnalyticsView(
  data: AnalyticsData,
  schoolId: string,
  classKey = "all",
  studentId = "",
) {
  const schoolStudents = data.students.filter((s) => s.school_id === schoolId);
  const schoolAttempts = data.attempts.filter((a) => a.student.school_id === schoolId);
  const students = schoolStudents.filter(
    (s) =>
      (classKey === "all" || `${s.class}|${s.division}` === classKey) &&
      (!studentId || s.id === studentId),
  );
  const ids = new Set(students.map((s) => s.id));
  const attempts = schoolAttempts.filter((a) => ids.has(a.student.id));
  const studentAttempts = new Map<string, Attempt[]>();
  const classAttempts = new Map<string, Attempt[]>();
  const classStudents = new Map<string, StudentReport[]>();
  const byAssessment = new Map<string, Attempt[]>();
  for (const s of schoolStudents) {
    const g = classStudents.get(s.class) ?? [];
    g.push(s);
    classStudents.set(s.class, g);
  }
  for (const a of schoolAttempts) {
    const g = classAttempts.get(a.student.class) ?? [];
    g.push(a);
    classAttempts.set(a.student.class, g);
  }
  for (const a of attempts) {
    const g = studentAttempts.get(a.student.id) ?? [];
    g.push(a);
    studentAttempts.set(a.student.id, g);
    const h = byAssessment.get(a.assessment.assessment_id) ?? [];
    h.push(a);
    byAssessment.set(a.assessment.assessment_id, h);
  }
  const compare = students.map((s) => ({
    student: s,
    ...summarize([s], studentAttempts.get(s.id) ?? []),
  }));
  const classes = [...classStudents.entries()]
    .map(([name, ss]) => ({ name, ...summarize(ss, classAttempts.get(name) ?? []) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const trend = [...byAssessment.values()]
    .map((rows) => ({
      assessment: rows[0].assessment,
      rank: studentId ? rows[0].rank : null,
      ...summarize(students, rows),
    }))
    .sort(
      (a, b) =>
        (a.assessment.date || "9999").localeCompare(b.assessment.date || "9999") ||
        a.assessment.assessment_id.localeCompare(b.assessment.assessment_id),
    );
  const schoolByAssessment = new Map<string, Attempt[]>();
  for (const a of schoolAttempts) {
    const rows = schoolByAssessment.get(a.assessment.assessment_id) ?? [];
    rows.push(a);
    schoolByAssessment.set(a.assessment.assessment_id, rows);
  }
  const schoolTrend = [...schoolByAssessment.values()]
    .map((rows) => ({
      assessment: rows[0].assessment,
      rank: null,
      ...summarize(schoolStudents, rows),
    }))
    .sort(
      (a, b) =>
        (a.assessment.date || "9999").localeCompare(b.assessment.date || "9999") ||
        a.assessment.assessment_id.localeCompare(b.assessment.assessment_id),
    );
  return {
    students,
    attempts,
    compare,
    schoolTrend,
    classes,
    trend,
    schoolStudents,
    schoolAttempts,
    summary: summarize(students, attempts),
    school: summarize(schoolStudents, schoolAttempts),
    subjects: areas(attempts, "subject"),
    parameters: areas(attempts, "parameter"),
    topics: areas(attempts, "topic"),
    chapters: areas(attempts, "chapter"),
  };
}
export function distribution(values: (number | null)[]) {
  const ranges = [
    [0, 40],
    [40, 60],
    [60, 80],
    [80, 90],
    [90, 101],
  ];
  return ranges.map(([lo, hi]) => ({
    name: hi === 101 ? "90–100%" : `${lo}–<${hi}%`,
    count: values.filter((v) => v != null && v >= lo && v < hi).length,
  }));
}
