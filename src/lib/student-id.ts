import { nextPermanentStudentCode } from "./academic.functions";
import { getAccessToken } from "./app-access";

// Format: <schoolCode>-STU<6-digit sequence>, e.g. SCH001-STU000001
export function formatStudentCode(schoolCode: string, seq: number): string {
  return `${schoolCode}-STU${String(seq).padStart(6, "0")}`;
}

// Compute the next sequence for a school by looking at existing student codes.
export async function nextStudentCode(schoolId: string, schoolCode: string): Promise<string> {
  return nextPermanentStudentCode({ data: { token: getAccessToken(), schoolId } });
}

export function isStudentUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; constraint?: string; message?: string };
  return (
    value.code === "23505" &&
    (!value.constraint ||
      value.constraint === "students_school_id_student_code_key" ||
      value.constraint === "students_school_id_class_division_roll_number_key")
  );
}

export function explainStudentUniqueConflict(
  error: unknown,
  fallback = "Student already exists in this school.",
): Error {
  if (!isStudentUniqueConflict(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const value = error as { constraint?: string };
  if (value.constraint === "students_school_id_student_code_key") {
    return new Error("This Student ID already exists in this school. Use a different Student ID.");
  }
  if (value.constraint === "students_school_id_class_division_roll_number_key") {
    return new Error("This roll number already exists in the selected class and division.");
  }
  return new Error(fallback);
}
