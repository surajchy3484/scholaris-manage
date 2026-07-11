import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import type { Student } from "./types";
import { dataUrlToBlob } from "./photo";

export type ImportRow = {
  name: string;
  class: string;
  division: string;
  roll_number: string;
  _row: number;
  _errors: string[];
};

export function parseImportFile(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = reader.result as ArrayBuffer;
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const parsed: ImportRow[] = rows.map((r, i) => {
          const get = (keys: string[]) => {
            for (const k of keys) {
              const found = Object.keys(r).find((rk) => rk.trim().toLowerCase() === k);
              if (found) return String(r[found] ?? "").trim();
            }
            return "";
          };
          const name = get(["student name", "name"]);
          const cls = get(["class"]);
          const division = get(["division", "section"]);
          const roll = get(["roll number", "roll no", "roll", "rollno"]);
          const errors: string[] = [];
          if (!name) errors.push("Missing student name");
          if (!cls) errors.push("Missing class");
          if (!division) errors.push("Missing division");
          if (!roll) errors.push("Missing roll number");
          return {
            name,
            class: cls,
            division,
            roll_number: roll,
            _row: i + 2,
            _errors: errors,
          };
        });
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function downloadSampleTemplate() {
  const rows = [
    { "Student Name": "Aisha Khan", Class: "5", Division: "A", "Roll Number": "1" },
    { "Student Name": "Rohan Patel", Class: "5", Division: "A", "Roll Number": "2" },
    { "Student Name": "Meera Iyer", Class: "5", Division: "B", "Roll Number": "1" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), "students-sample.xlsx");
}

export type StudentExportRow = {
  student_id: string;
  name: string;
  class: string;
  division: string;
  roll_number: string;
  attendance_percentage: number;
  photo_ref: string;
};

export function exportStudentsToExcel(schoolName: string, rows: StudentExportRow[]) {
  const shaped = rows.map((r) => ({
    "Student ID": r.student_id,
    "Student Name": r.name,
    Class: r.class,
    Division: r.division,
    "Roll Number": r.roll_number,
    "Attendance %": r.attendance_percentage,
    "Photo Path": r.photo_ref,
  }));
  const ws = XLSX.utils.json_to_sheet(shaped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${schoolName}-students.xlsx`);
}

export async function exportStudentsAsZip(
  schoolName: string,
  rows: StudentExportRow[],
  students: Student[],
) {
  const zip = new JSZip();
  const photoRows = rows.map((r) => {
    const s = students.find((s) => s.student_code === r.student_id);
    if (s?.photo_url?.startsWith("data:")) {
      const filename = `photos/${r.student_id}.jpg`;
      zip.file(filename, dataUrlToBlob(s.photo_url));
      return { ...r, photo_ref: filename };
    }
    return r;
  });
  const shaped = photoRows.map((r) => ({
    "Student ID": r.student_id,
    "Student Name": r.name,
    Class: r.class,
    Division: r.division,
    "Roll Number": r.roll_number,
    "Attendance %": r.attendance_percentage,
    "Photo Path": r.photo_ref,
  }));
  const ws = XLSX.utils.json_to_sheet(shaped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  zip.file("students.xlsx", buf);
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${schoolName}-export.zip`);
}
