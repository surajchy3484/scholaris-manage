import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
export type Row = Record<string, unknown> & { id: string };
export type Snapshot = Record<string, Row[]>;
export type Baseline = Record<string, Record<string, string>>;
// Relationships and generated fields cannot be edited through a workbook.
export const EDITABLE: Record<string, string[]> = {
  schools: ["location"],
  students: ["name", "roll_number", "enrollment_date"],
  attendance: ["date", "status"],
  exam_scores: ["score", "remarks"],
  assessments: [],
  questions: [],
  sessions: [],
  school_divisions: [],
  session_division_status: ["status"],
  clicker_records: [],
  assessment_results: [],
};
export const SHEETS: Record<string, string> = {
  schools: "School",
  students: "Students",
  attendance: "Attendance",
  exam_scores: "Exam Scores",
  assessments: "Assessments",
  questions: "Questions",
  sessions: "Sessions",
  school_divisions: "Divisions",
  session_division_status: "Session Status",
  clicker_records: "Clicker Data",
  assessment_results: "Assessment Results",
};
const NUMBERS = new Set([
  "score",
  "correct_rate",
  "ranking",
  "marks",
  "total_marks",
  "passing_marks",
  "total_questions",
  "question_no",
  "correct_answers",
  "wrong_answers",
  "sort_order",
]);
const SYSTEM = new Set(["created_at", "updated_at", "updated_by"]);
const json = (value: unknown): string =>
  JSON.stringify(
    value == null
      ? ""
      : Array.isArray(value)
        ? value.map((v) => JSON.parse(json(v)))
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, JSON.parse(json(v))]),
            )
          : value,
  );
const material = (row: Row) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !SYSTEM.has(key)));
export const hash = (row: Row) =>
  createHash("sha256")
    .update(json(material(row)))
    .digest("hex");
export const baseline = (data: Snapshot): Baseline =>
  Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [
      table,
      Object.fromEntries(rows.map((row) => [row.id, hash(row)])),
    ]),
  );
export function encodeWorkbook(schoolId: string, data: Snapshot): Uint8Array {
  const wb = XLSX.utils.book_new();
  const notes = [
    ["SchoolRise school workbook"],
    ["Edit the fields listed below, save the .xlsx file, then sync in the app."],
    [
      "Do not rename sheets or edit Record ID / relationship fields. Add and delete records in the app.",
    ],
    ["Deleted spreadsheet rows do not delete app records. Conflicting edits stop sync for review."],
    ["Photos are links; this workbook does not contain original photo files or user accounts."],
    ...Object.entries(SHEETS).map(([table, name]) => [
      name,
      EDITABLE[table].length
        ? `Editable: ${EDITABLE[table].join(", ")}`
        : "Reference only; edit this data in the app.",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes), "Read Me");
  for (const [table, name] of Object.entries(SHEETS)) {
    const rows = data[table] ?? [];
    const columns = [
      "id",
      ...new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => key !== "id")),
    ];
    const sheet = XLSX.utils.aoa_to_sheet([
      columns.map((key) => (key === "id" ? "Record ID" : key)),
      ...rows.map((row) =>
        columns.map((key) => {
          const value = row[key];
          const cell = value && typeof value === "object" ? JSON.stringify(value) : (value ?? "");
          if (typeof cell === "string" && cell.length > 32000)
            throw new Error(
              `${name}: a field exceeds Excel's cell size limit. Use a database backup for this record.`,
            );
          return cell;
        }),
      ),
    ]);
    sheet["!cols"] = columns.map((key) => ({ wch: key === "id" ? 38 : 22 }));
    sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["format", 1],
      ["school_id", schoolId],
    ]),
    "_SchoolRise",
  );
  wb.Workbook = {
    Sheets: wb.SheetNames.map((name) => ({ name, Hidden: name === "_SchoolRise" ? 2 : 0 })),
  };
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }));
}
export function decodeWorkbook(bytes: Uint8Array, schoolId: string, current: Snapshot): Snapshot {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const meta = wb.Sheets._SchoolRise
    ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets._SchoolRise, { header: 1 })
    : [];
  if (meta[0]?.[0] !== "format" || meta[0]?.[1] !== 1 || meta[1]?.[1] !== schoolId)
    throw new Error(
      "This is not the original SchoolRise workbook for this school. Do not remove its metadata sheet.",
    );
  const result: Snapshot = {};
  for (const [table, name] of Object.entries(SHEETS)) {
    const sheet = wb.Sheets[name];
    if (!sheet) throw new Error(`Missing sheet: ${name}. Restore its original name.`);
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const headers = (grid[0] ?? []).map(String);
    if (headers[0] !== "Record ID" || new Set(headers).size !== headers.length)
      throw new Error(`${name}: invalid headers`);
    const known = new Map((current[table] ?? []).map((row) => [row.id, row]));
    const seen = new Set<string>();
    result[table] = grid
      .slice(1)
      .map((cells, index) => ({ cells, index }))
      .filter(({ cells }) => cells.some((value) => value !== "" && value !== null))
      .map(({ cells, index }) => {
        for (let c = 0; c < headers.length; c++)
          if (sheet[XLSX.utils.encode_cell({ r: index + 1, c })]?.f)
            throw new Error(`${name} row ${index + 2}: formulas cannot be synced. Enter a value.`);
        const id = String(cells[0] ?? "");
        if (!id || seen.has(id))
          throw new Error(
            `${name} row ${index + 2}: missing or duplicate Record ID. Add new records in the app.`,
          );
        seen.add(id);
        const source = known.get(id);
        const row: Row = { id };
        headers.slice(1).forEach((key, i) => {
          const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: i + 1 })];
          if (cell?.f)
            throw new Error(`${name} row ${index + 2}: formulas cannot be synced. Enter a value.`);
          const value = cells[i + 1] ?? "";
          if (NUMBERS.has(key) || typeof source?.[key] === "number") {
            if (value === "") row[key] = null;
            else {
              const number = Number(value);
              if (!Number.isFinite(number)) throw new Error(`${name}: ${key} must be numeric`);
              row[key] = number;
            }
          } else if (key === "answers") {
            try {
              row[key] = value === "" ? null : JSON.parse(String(value));
            } catch {
              throw new Error(`${name}: invalid answers JSON`);
            }
          } else {
            if (typeof value !== "string")
              throw new Error(
                `${name}: ${key} must be text. Format date cells as text (YYYY-MM-DD).`,
              );
            row[key] = value === "" ? (source?.[key] === "" ? "" : null) : value;
          }
        });
        return row;
      });
  }
  return result;
}
export type Change = {
  table: string;
  id: string;
  expected: Record<string, unknown>;
  values: Record<string, unknown>;
};
export function planSync(
  current: Snapshot,
  drive: Snapshot,
  previous: Baseline,
): { changes: Change[]; conflicts: string[] } {
  const changes: Change[] = [],
    conflicts: string[] = [];
  for (const table of Object.keys(SHEETS)) {
    const app = new Map((current[table] ?? []).map((row) => [row.id, row]));
    for (const row of drive[table] ?? []) {
      const was = previous[table]?.[row.id],
        now = app.get(row.id),
        driveHash = hash(row);
      if (!was) {
        if (!now || driveHash !== hash(now))
          conflicts.push(
            `${SHEETS[table]}: unknown/new Record ID ${row.id}. Add new records in the app.`,
          );
        continue;
      }
      if (driveHash === was) continue; // App-only edits, including deletes, win without overwriting Drive edits.
      if (!now) {
        conflicts.push(`${SHEETS[table]} ${row.id}: edited in Drive but deleted in the app`);
        continue;
      }
      if (driveHash === hash(now)) continue; // Safe retry after an interrupted sync.
      if (hash(now) !== was) {
        conflicts.push(
          `${SHEETS[table]} ${row.id}: changed in both places. Make the Drive row match the intended app values, then retry.`,
        );
        continue;
      }
      const allowed = EDITABLE[table],
        values: Record<string, unknown> = {};
      const keys = new Set([...Object.keys(material(now)), ...Object.keys(material(row))]);
      let invalid = false;
      for (const key of keys) {
        if (json(now[key] ?? null) === json(row[key] ?? null)) continue;
        if (!allowed.includes(key)) {
          conflicts.push(`${SHEETS[table]} ${row.id}: ${key} is read-only`);
          invalid = true;
          break;
        }
        values[key] = row[key] ?? null;
      }
      if (!invalid && Object.keys(values).length)
        changes.push({ table, id: row.id, expected: material(now), values });
    }
  }
  return { changes, conflicts };
}
