export type GridRequest = {
  page: number;
  pageSize: number;
  search: string;
  sortKey: string | null;
  direction: "asc" | "desc";
};
export const DEFAULT_GRID_REQUEST: GridRequest = {
  page: 0,
  pageSize: 25,
  search: "",
  sortKey: null,
  direction: "asc",
};
export type PageResult<T> = { rows: T[]; total: number; questionColumns?: string[] };
export function attendanceTotals(rows: { student_id: string; status: string }[]) {
  const totals = new Map<string, { present: number; total: number }>();
  for (const row of rows) {
    const t = totals.get(row.student_id) ?? { present: 0, total: 0 };
    t.total++;
    t.present += Number(row.status === "present");
    totals.set(row.student_id, t);
  }
  return totals;
}
