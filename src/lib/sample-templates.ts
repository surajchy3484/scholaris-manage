import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/** Builds and downloads a small .xlsx sample file showing the expected columns. */
export function downloadSampleSheet(
  fileName: string,
  sheetName: string,
  rows: Record<string, string | number>[],
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), fileName);
}

export const ASSESSMENT_SAMPLE = {
  fileName: "assessments-sample.xlsx",
  sheetName: "Assessments",
  rows: [
    {
      "Assessment ID": "AS-001",
      "Assessment Name": "Term 1 Mathematics",
      "School Name": "Greenwood High",
      Class: "5",
      Section: "A",
      "Exam Type": "ICA",
      "Exam Date": "2026-04-15",
      "Total Question": 30,
      Status: "active",
    },
    {
      "Assessment ID": "AS-002",
      "Assessment Name": "Term 1 Science",
      "School Name": "Greenwood High",
      Class: "6",
      Section: "B",
      "Exam Type": "IMF",
      "Exam Date": "2026-04-18",
      "Total Question": 25,
      Status: "active",
    },
  ],
};

export const QUESTION_SAMPLE = {
  fileName: "questions-sample.xlsx",
  sheetName: "Questions",
  rows: [
    {
      "Assessment ID": "AS-001",
      "Question No": 1,
      "Correct Answer": "A",
      Parameter: "Knowledge",
      Topic: "Fractions",
      Chapter: "Chapter 2",
    },
    {
      "Assessment ID": "AS-001",
      "Question No": 2,
      "Correct Answer": "C",
      Parameter: "Application",
      Topic: "Decimals",
      Chapter: "Chapter 3",
    },
  ],
};

export function clickerSample(questionColumns: string[]) {
  const cols = questionColumns.length
    ? questionColumns
    : Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
  const answers = ["A", "B", "C", "D"];
  const make = (name: string, keypad: string, roll: string, offset: number) => {
    const row: Record<string, string | number> = {
      "Assessment ID": "AS-001",
      "Keypad ID": keypad,
      "Student Name": name,
      Roll: roll,
      Class: "5",
      Section: "A",
      Team: "Team 1",
    };
    cols.forEach((c, i) => (row[c] = answers[(i + offset) % 4]));
    return row;
  };
  return {
    fileName: "clicker-sample.xlsx",
    sheetName: "Clicker",
    rows: [make("Aisha Khan", "K01", "1", 0), make("Rohan Patel", "K02", "2", 1)],
  };
}

export const EXAM_SAMPLE = {
  fileName: "exam-report-sample.xlsx",
  sheetName: "Exam Report",
  rows: [
    {
      "Student ID": "",
      "Student Name": "Aisha Khan",
      Class: "5",
      Division: "A",
      "Roll Number": "1",
      "Enrollment Date": "2026-04-01",
      "Attendance %": 92,
      ICA: 78,
      IMF: 84,
      FCA: 88,
      "Photo URL": "",
    },
    {
      "Student ID": "",
      "Student Name": "Rohan Patel",
      Class: "5",
      Division: "A",
      "Roll Number": "2",
      "Enrollment Date": "2026-04-01",
      "Attendance %": 88,
      ICA: 65,
      IMF: 71,
      FCA: 74,
      "Photo URL": "",
    },
  ],
};

export const SESSION_SAMPLE = {
  fileName: "sessions-sample.xlsx",
  sheetName: "Sessions",
  rows: [
    { "Session Name": "Introduction", Class: "Class 5", Topic: "Basics" },
    { "Session Name": "Numbers", Class: "Class 5", Topic: "Number System" },
    { "Session Name": "Addition", Class: "Class 5", Topic: "Addition" },
    { "Session Name": "Fractions", Class: "Class 6", Topic: "Fractions" },
  ],
};

