import type { ClickerRecord, Assessment } from "./master";

type ImportValues = Pick<ClickerRecord,
  "assessment_id" | "exam_type" | "keypad_id" | "student_id" | "student_name" |
  "roll_number" | "class" | "section" | "team" | "answers"
>;

/** Explicitly exclude preview metadata and server-calculated scores from writes. */
export function clickerImportPayload(
  row: ImportValues,
  assessment: Pick<Assessment, "school_id" | "school_name"> | undefined,
  normalizedClass: string,
) {
  return {
    assessment_id: row.assessment_id,
    exam_type: row.exam_type,
    keypad_id: row.keypad_id,
    student_id: row.student_id,
    student_name: row.student_name,
    roll_number: row.roll_number,
    class: normalizedClass,
    section: row.section,
    team: row.team,
    answers: row.answers,
    school_id: assessment?.school_id ?? null,
    school_name: assessment?.school_name ?? null,
  };
}
