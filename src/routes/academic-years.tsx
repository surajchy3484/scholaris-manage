import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/app-access";
import {
  listAcademicYears,
  saveAcademicYear,
  setCurrentAcademicYear,
  listEnrollments,
  promoteEnrollments,
  academicSchools,
  setEnrollmentStatus,
  type Enrollment,
} from "@/lib/academic.functions";
import { StudentHistory } from "@/components/student-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const Route = createFileRoute("/academic-years")({ component: AcademicYearsPage });
const statuses = ["Active", "Promoted", "Transferred", "Left School", "Inactive"] as const;
function AcademicYearsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [className, setClassName] = useState("");
  const [division, setDivision] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [school, setSchool] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<
    (Enrollment & {
      targetSchool: string;
      targetClass: string;
      targetDivision: string;
      targetRoll: string;
      targetStatus: (typeof statuses)[number];
    })[]
  >([]);
  const [selected, setSelected] = useState<Enrollment[]>([]);
  const [student, setStudent] = useState<string | null>(null);
  const auth = () => ({ token: getAccessToken() });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears({ data: auth() }),
  });
  const schools = useQuery({
    queryKey: ["academic-schools"],
    queryFn: () => academicSchools({ data: auth() }),
  });
  const year = source || years.data?.find((y) => y.is_current)?.id || "";
  const rows = useQuery({
    queryKey: ["enrollments", year, school, search, className, division, page],
    queryFn: () =>
      listEnrollments({
        data: {
          ...auth(),
          year,
          schoolId: school || undefined,
          className,
          division,
          search,
          page,
          size: 50,
        },
      }),
    enabled: !!year,
  });
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["academic-years"] });
      await qc.invalidateQueries({ queryKey: ["enrollments"] });
      await qc.invalidateQueries({ queryKey: ["exam-data"] });
      await qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-5">
      <h1 className="text-3xl font-bold">Academic Year</h1>
      <p>Current year, previous years, student promotion and historical records.</p>
      {years.error && <p role="alert">{years.error.message}</p>}
      {isAdmin && (
        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">Year master</h2>
          <div className="flex gap-2">
            <Input
              placeholder="New year, e.g. 2027-28"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              disabled={busy || !name.trim()}
              onClick={() =>
                void action(() =>
                  saveAcademicYear({
                    data: { ...auth(), id: name.trim(), name: name.trim(), create: true },
                  }),
                )
              }
            >
              Add Year
            </Button>
          </div>
          {years.data?.map((y) => (
            <div key={y.id} className="flex items-center gap-3">
              <span>
                {y.name} {y.is_current ? "· Current" : ""}
              </span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const label = prompt("Year display name", y.name);
                  if (label)
                    void action(() =>
                      saveAcademicYear({
                        data: { ...auth(), id: y.id, name: label, create: false },
                      }),
                    );
                }}
              >
                Edit name
              </Button>
              {!y.is_current && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Set ${y.name} as Current? Existing yearly enrollments and results remain preserved.`,
                      )
                    )
                      void action(() =>
                        setCurrentAcademicYear({ data: { ...auth(), year: y.id } }),
                      );
                  }}
                >
                  Set Current
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <label>
          Academic Year{" "}
          <select
            className="rounded border p-2"
            value={year}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(0);
              setSelected([]);
              setDraft([]);
            }}
          >
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="School"
          value={school}
          onChange={(e) => {
            setSchool(e.target.value);
            setPage(0);
            setSelected([]);
          }}
        >
          <option value="">All permitted schools</option>
          {schools.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Class filter"
          aria-label="Enrollment class filter"
          value={className}
          onChange={(e) => {
            setClassName(e.target.value);
            setPage(0);
            setSelected([]);
          }}
        />
        <Input
          placeholder="Division filter"
          aria-label="Enrollment division filter"
          value={division}
          onChange={(e) => {
            setDivision(e.target.value);
            setPage(0);
            setSelected([]);
          }}
        />
        <Input
          placeholder="Search student name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
            setSelected([]);
          }}
        />
      </div>
      {rows.error && <p role="alert">{rows.error.message}</p>}
      {rows.isLoading && <p>Loading enrollments…</p>}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !rows.data?.total}
            onClick={() =>
              void action(async () => {
                const result = await listEnrollments({
                  data: {
                    ...auth(),
                    year,
                    schoolId: school || undefined,
                    className,
                    division,
                    search,
                    page: 0,
                    size: 500,
                  },
                });
                setSelected(result.rows);
              })
            }
          >
            Select matching students (up to 500)
          </Button>
          <select
            aria-label="Target academic year"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setDraft([]);
            }}
          >
            <option value="">Choose next academic year</option>
            {years.data
              ?.filter((y) => y.id !== year)
              .map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
          </select>
          <Button
            disabled={!selected.length || selected.length > 500 || !target || busy}
            onClick={() =>
              setDraft(
                selected.map((e) => ({
                  ...e,
                  targetSchool: e.school_id,
                  targetClass: /^\d+$/.test(e.class) ? String(Number(e.class) + 1) : e.class,
                  targetDivision: e.division,
                  targetRoll: e.roll_number,
                  targetStatus: "Active",
                })),
              )
            }
          >
            Review promotion ({selected.length})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="Select all on this page"
                  type="checkbox"
                  checked={
                    !!rows.data?.rows.length &&
                    rows.data.rows.every((r) => selected.some((s) => s.id === r.id))
                  }
                  onChange={(e) => setSelected(e.target.checked ? (rows.data?.rows ?? []) : [])}
                />
              </th>
              {[
                "Student ID",
                "Name",
                "School",
                "Class",
                "Division",
                "Roll",
                "Status",
                "History",
              ].map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.data?.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    aria-label={`Select ${r.students.name}`}
                    type="checkbox"
                    checked={selected.some((s) => s.id === r.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, r] : selected.filter((s) => s.id !== r.id),
                      )
                    }
                  />
                </td>
                {[
                  r.students.student_code,
                  r.students.name,
                  schools.data?.find((s) => s.id === r.school_id)?.name,
                  r.class,
                  r.division,
                  r.roll_number,
                ].map((v, i) => (
                  <td key={i} className="p-2">
                    {v}
                  </td>
                ))}
                <td>
                  {isAdmin ? (
                    <select
                      value={r.status}
                      onChange={(e) =>
                        void action(() =>
                          setEnrollmentStatus({
                            data: {
                              ...auth(),
                              id: r.id,
                              status: e.target.value as (typeof statuses)[number],
                            },
                          }),
                        )
                      }
                    >
                      {statuses.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    r.status
                  )}
                </td>
                <td>
                  <Button variant="outline" onClick={() => setStudent(r.student_id)}>
                    History
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          {rows.data?.total ?? 0} enrollments · Page {page + 1}
        </span>
        <Button
          disabled={(page + 1) * 50 >= (rows.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      {!!draft.length && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-bold">Review new {target} enrollments</h2>
          <p>
            Suggested classes are editable. Source enrollments will remain unchanged. Saving is
            atomic; existing target enrollments are rejected.
          </p>
          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  {["Student", "School", "New Class", "Division", "Roll", "Status"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.map((r, i) => (
                  <tr key={r.id}>
                    <td>{r.students.name}</td>
                    <td>
                      <select
                        value={r.targetSchool}
                        onChange={(e) =>
                          setDraft(
                            draft.map((v, j) =>
                              j === i ? { ...v, targetSchool: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        {schools.data?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(["targetClass", "targetDivision", "targetRoll"] as const).map((key) => (
                      <td key={key}>
                        <Input
                          aria-label={`${r.students.name} ${key}`}
                          value={r[key]}
                          onChange={(e) =>
                            setDraft(
                              draft.map((v, j) => (j === i ? { ...v, [key]: e.target.value } : v)),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <select
                        value={r.targetStatus}
                        onChange={(e) =>
                          setDraft(
                            draft.map((v, j) =>
                              j === i
                                ? {
                                    ...v,
                                    targetStatus: e.target.value as (typeof statuses)[number],
                                  }
                                : v,
                            ),
                          )
                        }
                      >
                        {statuses.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await promoteEnrollments({
                  data: {
                    ...auth(),
                    source: year,
                    target,
                    rows: draft.map((r) => ({
                      source_id: r.id,
                      school_id: r.targetSchool,
                      class: r.targetClass,
                      division: r.targetDivision,
                      roll_number: r.targetRoll,
                      status: r.targetStatus,
                    })),
                  },
                });
                setDraft([]);
                setSelected([]);
              })
            }
          >
            Confirm new enrollments
          </Button>
          <Button variant="outline" onClick={() => setDraft([])}>
            Cancel
          </Button>
        </section>
      )}
      {student && <StudentHistory key={student} studentId={student} />}
    </main>
  );
}
