import type { adminDb } from "./app-access.server";
import { fetchAllRows } from "./fetch-all";
// Temporary, read-only compatibility path for deployments awaiting the SQL RPC migrations.
// Invoked only AFTER the caller's module permission and school assignment checks.
type Db = Awaited<ReturnType<typeof adminDb>>;
type Args = Record<string, unknown>;
type Row = Record<string, unknown> & { answers?: Record<string, unknown> | null };
const text = (v: unknown) => String(v ?? "");
const includes = (value: unknown, search: unknown) =>
  text(value).toLowerCase().includes(text(search).trim().toLowerCase());
function page(rows: Row[], args: Args) {
  const start = Number(args.p_page ?? 0) * Number(args.p_size ?? 50);
  return { rows: rows.slice(start, start + Number(args.p_size ?? 50)), total: rows.length };
}
async function read(
  db: Db,
  table: string,
  filters: Record<string, unknown> = {},
  columns = "*",
): Promise<Row[]> {
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) && value.length === 0) return [];
    if (Array.isArray(value) && value.length > 100) {
      const unique = [...new Set(value)],
        rows: Row[] = [];
      for (let start = 0; start < unique.length; start += 100)
        rows.push(
          ...(await read(
            db,
            table,
            { ...filters, [key]: unique.slice(start, start + 100) },
            columns,
          )),
        );
      return rows;
    }
  }
  return fetchAllRows<Row>((from, to) => {
    // Table and column names originate exclusively from the fixed dispatch below.
    let query = db
      .from(table as never)
      .select(columns)
      .order("id")
      .range(from, to);
    for (const [key, value] of Object.entries(filters))
      query = Array.isArray(value)
        ? query.in(key as never, value)
        : query.eq(key as never, value as never);
    return query as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
}
function sortStudents(rows: Row[], sort: unknown) {
  return rows.sort((a, b) => {
    const desc = text(sort).endsWith("desc");
    let result: number;
    if (text(sort).startsWith("name")) result = text(a.name).localeCompare(text(b.name));
    else {
      const aa = /^[+-]?\d+/.exec(text(a.roll_number)),
        bb = /^[+-]?\d+/.exec(text(b.roll_number));
      if (!aa !== !bb) return aa ? -1 : 1;
      result = aa && bb ? Number(aa[0]) - Number(bb[0]) : 0;
      if (!result) result = text(a.roll_number).localeCompare(text(b.roll_number));
    }
    return result ? (desc ? -result : result) : text(a.id).localeCompare(text(b.id));
  });
}
async function students(db: Db, args: Args) {
  const filters: Args = { school_id: args.p_school };
  if (args.p_class && args.p_class !== "all") filters.class = args.p_class;
  if (args.p_division && args.p_division !== "all") filters.division = args.p_division;
  return (await read(db, "students", filters)).filter(
    (r) =>
      !args.p_search ||
      [r.name, r.student_code, r.roll_number].some((value) => includes(value, args.p_search)),
  );
}
export const COMPAT_READS = new Set([
  "performance_student_facets",
  "performance_student_page",
  "student_details_page",
  "performance_master_page",
  "performance_question_keys",
]);
export async function readWithoutPagingRpc(db: Db, name: string, args: Args): Promise<unknown> {
  if (name === "performance_student_facets") {
    const rows = await read(db, "students", { school_id: args.p_school }, "id,class,division");
    const groups = new Map(
      rows.map((r) => [
        JSON.stringify([r.class, r.division]),
        { class: r.class, division: r.division },
      ]),
    );
    return {
      total: rows.length,
      groups: [...groups.values()].sort(
        (a, b) =>
          text(a.class).localeCompare(text(b.class)) ||
          text(a.division).localeCompare(text(b.division)),
      ),
    };
  }
  if (name === "performance_student_page")
    return page(sortStudents(await students(db, args), args.p_sort), args);
  if (name === "student_details_page") {
    const [base, scores, attendance, schools] = await Promise.all([
      students(db, args),
      read(
        db,
        "exam_scores",
        { school_id: args.p_school },
        "id,student_id,exam_type,score,remarks,updated_at",
      ),
      read(db, "attendance", { school_id: args.p_school }, "id,student_id,status"),
      read(db, "schools", { id: args.p_school }, "id,name,code"),
    ]);
    const scoreMap = new Map<string, Row>();
    for (const score of scores) {
      const key = JSON.stringify([score.student_id, score.exam_type]);
      const previous = scoreMap.get(key);
      if (
        !previous ||
        text(score.updated_at) > text(previous.updated_at) ||
        (score.updated_at === previous.updated_at && text(score.id) > text(previous.id))
      )
        scoreMap.set(key, score);
    }
    const totals = new Map<string, { n: number; present: number }>();
    for (const row of attendance) {
      const t = totals.get(text(row.student_id)) ?? { n: 0, present: 0 };
      t.n++;
      if (row.status === "present") t.present++;
      totals.set(text(row.student_id), t);
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const rows = base
      .map((student) => {
        const score = (type: string) => scoreMap.get(JSON.stringify([student.id, type]));
        const ica = score("ICA")?.score ?? null,
          mca = score("MCA")?.score ?? score("IMF")?.score ?? null,
          fca = score("FCA")?.score ?? null;
        const override = score("ATTENDANCE")?.score ?? null,
          t = totals.get(text(student.id));
        const performance = round((Number(ica ?? 0) + Number(mca ?? 0) + Number(fca ?? 0)) / 3);
        return {
          ...student,
          school_name: schools[0]?.name ?? "",
          school_code: schools[0]?.code ?? "",
          ica,
          mca,
          fca,
          attendance_override: override,
          attendance_recorded: override !== null || !!t?.n,
          attendance_pct: override ?? (t?.n ? round((100 * t.present) / t.n) : 0),
          remarks: score("FCA")?.remarks ?? null,
          performance,
          status:
            performance >= 90
              ? "Excellent"
              : performance >= 75
                ? "Very Good"
                : performance >= 60
                  ? "Good"
                  : performance >= 40
                    ? "Average"
                    : "Needs Improvement",
        };
      })
      .filter((row) => {
        const att = args.p_attendance ?? "all";
        if (
          (att === "recorded" && !row.attendance_recorded) ||
          (att === "missing" && row.attendance_recorded) ||
          (att === "below75" && (!row.attendance_recorded || Number(row.attendance_pct) >= 75)) ||
          (att === "atleast75" && (!row.attendance_recorded || Number(row.attendance_pct) < 75))
        )
          return false;
        const value = args.p_exam === "IMF" ? row.mca : args.p_exam === "FCA" ? row.fca : row.ica;
        if (
          (args.p_status === "recorded" && value === null) ||
          (args.p_status === "missing" && value !== null)
        )
          return false;
        return (
          (args.p_min == null || (value !== null && Number(value) >= Number(args.p_min))) &&
          (args.p_max == null || (value !== null && Number(value) <= Number(args.p_max)))
        );
      });
    return page(sortStudents(rows, args.p_sort), args);
  }
  if (name === "performance_question_keys" || name === "performance_master_page") {
    const table = name === "performance_question_keys" ? "questions" : text(args.p_table);
    if (!["assessments", "questions", "clicker_records"].includes(table))
      throw new Error("Invalid table");
    const filters: Args = {};
    if (args.p_schools !== null && args.p_schools !== undefined) {
      const scope = args.p_schools as string[];
      if (!scope.length)
        return name === "performance_question_keys"
          ? []
          : { rows: [], total: 0, questionColumns: [] };
      if (table === "questions") {
        const assessments = await read(db, "assessments", { school_id: scope }, "id,assessment_id");
        if (!assessments.length)
          return name === "performance_question_keys" ? [] : { rows: [], total: 0 };
        filters.assessment_id = assessments.map((r) => r.assessment_id);
      } else filters.school_id = scope;
    }
    if (name === "performance_question_keys") {
      const requested = args.p_assessments as string[];
      filters.assessment_id = Array.isArray(filters.assessment_id)
        ? requested.filter((id) => (filters.assessment_id as string[]).includes(id))
        : requested;
    } else if (args.p_assessment && args.p_assessment !== "all") {
      if (
        Array.isArray(filters.assessment_id) &&
        !filters.assessment_id.includes(args.p_assessment)
      )
        return { rows: [], total: 0 };
      filters.assessment_id = args.p_assessment;
    }
    let rows = await read(
      db,
      table,
      filters,
      name === "performance_question_keys" ? "id,assessment_id,question_no,correct_answer" : "*",
    );
    if (name === "performance_question_keys")
      return rows
        .filter((r) => (args.p_assessments as string[]).includes(text(r.assessment_id)))
        .map(({ assessment_id, question_no, correct_answer }) => ({
          assessment_id,
          question_no,
          correct_answer,
        }));
    if (args.p_assessment && args.p_assessment !== "all")
      rows = rows.filter((r) => r.assessment_id === args.p_assessment);
    const questionColumns =
      table === "clicker_records"
        ? [
            ...new Set(
              rows.flatMap((r) =>
                Object.keys(r.answers ?? {})
                  .map((key) => key.toUpperCase())
                  .filter((key) => /^S\d+$/.test(key)),
              ),
            ),
          ].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        : undefined;
    if (args.p_subject && table === "questions")
      rows = rows.filter((r) => includes(r.subject, args.p_subject));
    if (args.p_min_score != null && table === "clicker_records")
      rows = rows.filter((r) => r.score != null && Number(r.score) >= Number(args.p_min_score));
    if (args.p_class && table === "clicker_records")
      rows = rows.filter((r) => includes(r.class, args.p_class));
    if (args.p_section && table === "clicker_records")
      rows = rows.filter((r) => includes(r.section, args.p_section));
    if (args.p_team && table === "clicker_records")
      rows = rows.filter((r) => includes(r.team, args.p_team));
    if (text(args.p_search).trim())
      rows = rows.filter((r) =>
        Object.entries(r)
          .filter(([key]) => !["id", "school_id", "created_at", "updated_at"].includes(key))
          .some(([, value]) =>
            includes(typeof value === "object" ? JSON.stringify(value) : value, args.p_search),
          ),
      );
    const key =
      text(args.p_sort) ||
      (table === "assessments" ? "created_at" : table === "questions" ? "question_no" : "ranking");
    const desc = !!args.p_desc || (!args.p_sort && table === "assessments");
    rows.sort((a, b) => {
      const aa = /^S\d+$/.test(key) ? a.answers?.[key] : a[key],
        bb = /^S\d+$/.test(key) ? b.answers?.[key] : b[key];
      if (aa == null || bb == null)
        return aa == null && bb == null
          ? text(a.id).localeCompare(text(b.id))
          : aa == null
            ? 1
            : -1;
      const cmp =
        typeof aa === "number" && typeof bb === "number"
          ? aa - bb
          : text(aa).localeCompare(text(bb));
      return cmp ? (desc ? -cmp : cmp) : text(a.id).localeCompare(text(b.id));
    });
    return { ...page(rows, args), questionColumns };
  }
  throw new Error("No read compatibility path");
}
