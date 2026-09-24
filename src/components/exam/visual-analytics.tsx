import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAssessments, fetchClickerRecords, fetchQuestions } from "@/lib/master";
import { fetchDivisionSessions, UNITS } from "@/lib/sessions";
import {
  buildAnalyticsView,
  DEFAULT_THRESHOLDS,
  prepareAnalytics,
  validThresholds,
  type Thresholds,
} from "@/lib/visual-analytics";
import { analyticsReport } from "@/lib/visual-analytics-report";
import type { StudentReport } from "@/lib/exam";

type Props = {
  students: StudentReport[];
  schoolId: string;
  schoolName: string;
  classKey: string;
  studentId: string;
  mode: string;
};
export function useVisualAnalytics(props: Props) {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [remarks, setRemarks] = useState("");
  const [focusStudent, setFocusStudent] = useState("");
  const active = ["class", "school", "student"].includes(props.mode) && props.schoolId !== "all";
  const query = useQuery({
    queryKey: ["visual-analytics-source"],
    enabled: active,
    queryFn: async () => {
      const [assessments, questions, records] = await Promise.all([
        fetchAssessments(),
        fetchQuestions(),
        fetchClickerRecords(),
      ]);
      return { assessments, questions, records };
    },
    staleTime: 60_000,
  });
  const selectedStudent = props.students.find(
    (s) => s.id === props.studentId && s.school_id === props.schoolId,
  );
  const effectiveClass =
    props.mode === "school"
      ? "all"
      : props.mode === "student" && selectedStudent
        ? `${selectedStudent.class}|${selectedStudent.division}`
        : props.classKey;
  const [klass, division] = effectiveClass.split("|");
  const sessions = useQuery({
    queryKey: ["visual-analytics-sessions", props.schoolId, effectiveClass],
    enabled: active && effectiveClass !== "all",
    queryFn: async () =>
      Promise.all(
        UNITS.map(async (unit) => {
          const rows = await fetchDivisionSessions({
            schoolId: props.schoolId,
            klass,
            division,
            unit,
          });
          return {
            unit,
            complete: rows.filter((r) => r.status === "complete").length,
            total: rows.length,
          };
        }),
      ),
    staleTime: 60_000,
  });
  const prepared = useMemo(
    () =>
      query.data
        ? prepareAnalytics(
            props.students,
            query.data.assessments,
            query.data.questions,
            query.data.records,
          )
        : null,
    [props.students, query.data],
  );
  const exportView = useMemo(
    () =>
      prepared
        ? buildAnalyticsView(
            prepared,
            props.schoolId,
            props.mode === "school" ? "all" : effectiveClass,
            props.mode === "student" ? props.studentId : "",
          )
        : null,
    [prepared, props.schoolId, props.mode, effectiveClass, props.studentId],
  );
  const validFocus = exportView?.students.some((s) => s.id === focusStudent) ? focusStudent : "";
  const screenView = useMemo(
    () =>
      prepared && validFocus && props.mode !== "student"
        ? buildAnalyticsView(prepared, props.schoolId, effectiveClass, validFocus)
        : exportView,
    [prepared, props.schoolId, props.mode, effectiveClass, validFocus, exportView],
  );
  const ready =
    active &&
    !!exportView &&
    validThresholds(thresholds) &&
    !query.isFetching &&
    !(effectiveClass !== "all" && sessions.isFetching) &&
    (props.mode !== "class" || effectiveClass !== "all") &&
    (props.mode !== "student" || !!selectedStudent);
  const options = {
    school: props.schoolName,
    classLabel:
      props.mode === "school" || effectiveClass === "all"
        ? "All classes"
        : `Class ${klass} · ${division}`,
    thresholds,
    remarks,
    sessions: props.mode === "school" ? undefined : sessions.data,
    sessionMessage: sessions.isError
      ? "Session progress unavailable. Check your Session Status access and retry."
      : sessions.isFetching
        ? "Loading session progress…"
        : "Select a class and section to view session progress.",
    student: props.mode === "student",
    excluded: prepared?.excluded ?? 0,
    duplicates: prepared?.duplicates ?? 0,
  };
  const html = ready && exportView ? analyticsReport(exportView, options) : "";
  const screenHtml =
    screenView === exportView
      ? html
      : ready && screenView
        ? analyticsReport(screenView, {
            ...options,
            student: props.mode === "student" || !!validFocus,
          })
        : "";
  return {
    ...props,
    active,
    thresholds,
    setThresholds,
    remarks,
    setRemarks,
    focusStudent: validFocus,
    setFocusStudent,
    query,
    sessions,
    exportView,
    ready,
    html,
    screenHtml,
  };
}
export function VisualAnalytics({
  analytics: a,
}: {
  analytics: ReturnType<typeof useVisualAnalytics>;
}) {
  if (!["class", "school", "student"].includes(a.mode)) return null;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-2xl font-bold">Visual Analytics &amp; Improvement</h2>
      {!a.active ? (
        <p>Select one school to explore School → Class → Student performance.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Use the report buttons and school/class selectors above to drill down. Student search
            does not remove students from class analytics or exports.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["strong", "Strong from (%)"],
                ["good", "Good from (%)"],
                ["attention", "Needs attention from (%)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Number.isFinite(a.thresholds[key]) ? a.thresholds[key] : ""}
                  onChange={(e) =>
                    a.setThresholds({
                      ...a.thresholds,
                      [key]: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                />
              </label>
            ))}
          </div>
          {!validThresholds(a.thresholds) && (
            <p role="alert" className="text-destructive">
              Use 100 ≥ Strong &gt; Good &gt; Needs attention ≥ 0.
            </p>
          )}
          {a.mode === "class" && a.classKey === "all" && (
            <p>Select a class and section to generate the complete class report.</p>
          )}
          {a.query.isPending && <p role="status">Loading assessment analytics…</p>}
          {a.query.isError && (
            <div role="alert">
              <p>
                Analytics could not load. Access to Assessment Master, Question Master, and Clicker
                Data is required.
              </p>
              <button type="button" className="underline" onClick={() => a.query.refetch()}>
                Retry analytics
              </button>
            </div>
          )}
          {a.sessions.isError && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => a.sessions.refetch()}
            >
              Retry session progress
            </button>
          )}
          {a.query.isFetching && !a.query.isPending && <p role="status">Refreshing analytics…</p>}
          {a.sessions.isFetching && <p role="status">Loading session progress…</p>}
          {a.mode !== "student" && a.exportView && (
            <label className="block text-sm">
              Individual student progress (dashboard only; class PDF includes everyone)
              <select
                className="mt-1 block w-full rounded-md border bg-background p-2"
                value={a.focusStudent}
                onChange={(e) => a.setFocusStudent(e.target.value)}
              >
                <option value="">All students</option>
                {a.exportView.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · Roll {s.roll_number} · {s.class}/{s.division}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Teacher remarks
            <textarea
              rows={3}
              value={a.remarks}
              onChange={(e) => a.setRemarks(e.target.value)}
              placeholder="Add teaching observations and next steps for the report…"
              className="mt-1 block w-full rounded-md border bg-background p-2"
            />
          </label>
          {a.screenHtml && <div dangerouslySetInnerHTML={{ __html: a.screenHtml }} />}
        </>
      )}
    </section>
  );
}
