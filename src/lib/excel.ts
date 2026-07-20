import * as XLSX from "xlsx";
import FileSaver from "file-saver";
const { saveAs } = FileSaver;
import JSZip from "jszip";
import type { Student } from "./types";
import { dataUrlToBlob } from "./photo";
import { extractDriveFileId } from "./drive.functions";

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
  school_name: string;
  class: string;
  division: string;
  roll_number: string;
  attendance_percentage: number;
  photo_url: string;
  created_at: string;
  updated_at: string;
};

function shapeRows(rows: StudentExportRow[]) {
  return rows.map((r) => ({
    "Student ID": r.student_id,
    "Student Name": r.name,
    "School Name": r.school_name,
    Class: r.class,
    Division: r.division,
    "Roll Number": r.roll_number,
    "Attendance %": r.attendance_percentage,
    "Photo URL": r.photo_url,
    "Created Date": r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
    "Updated Date": r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : "",
  }));
}

function makeWorkbookWithHyperlinks(shaped: ReturnType<typeof shapeRows>) {
  const ws = XLSX.utils.json_to_sheet(shaped);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  // Locate the "Photo URL" column
  let photoCol = -1;
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]?.v === "Photo URL") {
      photoCol = C;
      break;
    }
  }
  if (photoCol >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: photoCol });
      const cell = ws[addr];
      const raw = cell && typeof cell.v === "string" ? cell.v : "";
      if (raw && /^https?:\/\//.test(raw)) {
        // Normalize any Drive URL variant to a link that opens the exact
        // image in a new browser tab. Non-Drive https URLs pass through.
        const fileId = extractDriveFileId(raw);
        const target = fileId
          ? `https://lh3.googleusercontent.com/d/${fileId}=w1600`
          : raw;
        ws[addr] = {
          t: "s",
          v: "View Image",
          l: { Target: target, Tooltip: "Open student photo" },
        };
      } else {
        ws[addr] = { t: "s", v: "No Photo" };
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  return wb;
}

export function exportStudentsToExcel(schoolName: string, rows: StudentExportRow[]) {
  const wb = makeWorkbookWithHyperlinks(shapeRows(rows));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${schoolName}-students.xlsx`);
}

export async function exportStudentsAsZip(
  schoolName: string,
  rows: StudentExportRow[],
  students: Student[],
) {
  const zip = new JSZip();
  const patched = rows.map((r) => {
    const s = students.find((s) => s.student_code === r.student_id);
    // For students whose photo is still a local data URL (pre-Drive), embed
    // in the zip and point Photo URL at the local relative path.
    if (s?.photo_url?.startsWith("data:")) {
      const filename = `photos/${r.student_id}.jpg`;
      zip.file(filename, dataUrlToBlob(s.photo_url));
      return { ...r, photo_url: filename };
    }
    return r;
  });
  const wb = makeWorkbookWithHyperlinks(shapeRows(patched));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  zip.file("students.xlsx", buf);
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${schoolName}-export.zip`);
}
