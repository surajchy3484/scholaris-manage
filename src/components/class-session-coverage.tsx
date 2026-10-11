import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSessionCoverage, saveCoverageThresholds } from "@/lib/session-coverage.functions";
import { COVERAGE_CLASSES, coverageCategory, coveragePercentage } from "@/lib/session-coverage";
import { getAccessToken } from "@/lib/app-access";
import { getAcademicYear } from "@/lib/academic-year";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const units = ["Unit-1", "Unit-2", "Unit-3", "Unit-4"];
const categories = [
  "Fully Covered",
  "Almost All Schools",
  "Partially Covered",
  "Low Coverage",
  "Not Started",
  "Not Recorded",
];
const selectStyle = "rounded-md border bg-background px-3 py-2 text-sm";
const dateText = (date: string | null) =>
  date ? new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
export function ClassSessionCoverage({
  context = "dashboard",
}: {
  context?: "dashboard" | "assessments";
}) {
  const { profile, can, ready } = useAuth();
  const qc = useQueryClient();
  const [klass, setKlass] = useState<(typeof COVERAGE_CLASSES)[number]>("5");
  const [centre, setCentre] = useState("");
  const [trainer, setTrainer] = useState("");
  const [category, setCategory] = useState("");
  const [session, setSession] = useState<string | undefined>();
  const [school, setSchool] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [almostAll, setAlmostAll] = useState("80");
  const [partial, setPartial] = useState("50");
  const year = getAcademicYear();
  const filters = {
    academicYear: year,
    class: klass,
    centre: centre || undefined,
    trainer: trainer || undefined,
    context,
  };
  const scope = [
    profile?.userId,
    profile?.role,
    profile?.schoolIds,
    profile?.allSchools,
    profile?.permissions,
  ];
  const allowed = can("session_status", "view") && can(context, "view");
  const query = useQuery({
    queryKey: ["class-session-coverage", scope, filters],
    queryFn: () => getSessionCoverage({ data: { ...filters, token: getAccessToken() } }),
    enabled: ready && allowed,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });
  const details = useQuery({
    queryKey: ["class-session-coverage", scope, filters, session],
    queryFn: () => getSessionCoverage({ data: { ...filters, session, token: getAccessToken() } }),
    enabled: ready && allowed && !!session,
    staleTime: 0,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () =>
      saveCoverageThresholds({
        data: {
          token: getAccessToken(),
          academicYear: year,
          almost_all: Number(almostAll),
          partial: Number(partial),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["class-session-coverage"] });
      setSettingsOpen(false);
      toast.success("Coverage thresholds saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!allowed) return null;
  const d = query.data;
  const rows = (d?.metrics ?? []).filter(
    (r) =>
      !category ||
      (category === "Not Recorded"
        ? r.not_recorded > 0
        : coverageCategory(r, d?.thresholds) === category),
  );
  const selected = d?.metrics.find((r) => r.id === session);
  const changeClass = (value: string) => {
    setKlass(value as typeof klass);
    setSession(undefined);
    setSchool("");
  };
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 text-foreground sm:p-6"
      aria-label="Class-wise Session Completion"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {context === "assessments"
              ? "Topic coverage for ICA / MCA / FCA"
              : "Session-wise Completion"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One common session per class and unit · Academic year {d?.year ?? year}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void qc.invalidateQueries({ queryKey: ["class-session-coverage"] })}
        >
          {query.isFetching ? "Updating…" : "Refresh"}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-semibold text-green-800 dark:text-green-300">
          Class
          <select
            className={selectStyle + " border-green-600"}
            value={klass}
            onChange={(e) => changeClass(e.target.value)}
          >
            {COVERAGE_CLASSES.map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Centre
          <select
            className={selectStyle}
            value={centre}
            onChange={(e) => {
              setCentre(e.target.value);
              setSession(undefined);
            }}
          >
            <option value="">All authorized centres</option>
            {d?.centres.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Trainer
          <select
            className={selectStyle}
            value={trainer}
            onChange={(e) => {
              setTrainer(e.target.value);
              setSession(undefined);
            }}
          >
            <option value="">All authorized trainers</option>
            {d?.trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Topic coverage
          <select
            className={selectStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All topics</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {profile?.role === "admin" && (
          <Button
            variant="outline"
            onClick={() => {
              setAlmostAll(String(d?.thresholds.almost_all ?? 80));
              setPartial(String(d?.thresholds.partial ?? 50));
              setSettingsOpen(!settingsOpen);
            }}
          >
            Coverage thresholds
          </Button>
        )}
      </div>
      {settingsOpen && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg bg-background p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="text-sm">
            Almost All Schools ≥ %
            <input
              className={selectStyle + " block w-24"}
              type="number"
              min="1"
              max="99"
              step="any"
              required
              value={almostAll}
              onChange={(e) => setAlmostAll(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Partially Covered ≥ %
            <input
              className={selectStyle + " block w-24"}
              type="number"
              min="1"
              max="99"
              step="any"
              required
              value={partial}
              onChange={(e) => setPartial(e.target.value)}
            />
          </label>
          <Button disabled={save.isPending} type="submit">
            Save for this year
          </Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">
        Green: schools completed · Blue: not completed · Grey: not recorded. Each school counts
        once. All roster divisions must be Complete for a school to count as completed. Cancelled
        assignments are excluded. These filters apply to this section; use the school filter inside
        a session’s details.
      </p>
      <p className="rounded-lg bg-blue-50 dark:bg-blue-950/40 p-3 text-sm text-blue-900 dark:text-blue-200">
        High coverage can guide ICA, MCA or FCA topic selection. It measures topic delivery, not
        student mastery. No assessment is created automatically.
      </p>
      {query.error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {query.error.message}
        </p>
      )}
      {query.isPending && <p role="status">Loading class session coverage…</p>}
      {d && (
        <div className="grid gap-5 lg:grid-cols-2">
          {units.map((unit) => (
            <article key={unit} className="min-w-0 rounded-xl border p-4">
              <h3 className="mb-4 font-semibold">
                {unit.replace("-", " ")} — Class-wise Session Completion
              </h3>
              <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
                {rows
                  .filter((r) => r.unit === unit)
                  .map((r) => {
                    const percent = coveragePercentage(r);
                    const label = coverageCategory(r, d.thresholds);
                    const high = label === "Fully Covered" || label === "Almost All Schools";
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={
                          "block w-full rounded-lg border p-3 text-left hover:border-blue-500 focus-visible:outline-blue-600 " +
                          (high
                            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40"
                            : "")
                        }
                        onClick={() => {
                          setSession(r.id);
                          setSchool("");
                        }}
                      >
                        <span className="block break-words text-sm font-medium">
                          {r.session_name}
                        </span>
                        {r.topic && r.topic !== r.session_name && (
                          <span className="block break-words text-xs text-muted-foreground">
                            {r.topic}
                          </span>
                        )}
                        <span className="mt-1 block text-sm font-semibold">
                          {r.completed} / {r.eligible} schools completed ·{" "}
                          {percent === null ? "N/A" : `${Number(percent.toFixed(1))}%`}
                        </span>
                        <span
                          className="my-2 flex h-4 overflow-hidden rounded bg-muted"
                          role="img"
                          aria-label={`${r.completed} completed, ${r.pending} not completed, ${r.not_recorded} not recorded`}
                        >
                          <span className="bg-green-600" style={{ width: `${percent ?? 0}%` }} />
                          <span
                            className="bg-blue-400"
                            style={{ width: `${r.eligible ? (r.pending / r.eligible) * 100 : 0}%` }}
                          />
                          <span
                            className="bg-slate-300 dark:bg-slate-500"
                            style={{
                              width: `${r.eligible ? (r.not_recorded / r.eligible) * 100 : 0}%`,
                            }}
                          />
                        </span>
                        <span className="block text-xs">
                          {label}
                          {r.not_recorded > 0 ? ` · Not Recorded: ${r.not_recorded} schools` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Not completed: {r.pending} · Not recorded: {r.not_recorded}
                        </span>
                        <span className="mt-1 block break-all text-[10px] text-muted-foreground">
                          Session ID: {r.id}
                        </span>
                      </button>
                    );
                  })}
                {!rows.some((r) => r.unit === unit) && (
                  <p className="py-8 text-sm text-muted-foreground">
                    No sessions match this class and coverage filter.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={!!session}
        onOpenChange={(open) => {
          if (!open) setSession(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.session_name ?? "Session completion details"} — Class {klass}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Completion dates below are the saved completion-status timestamps. Trainer assignments
            are current; recorded by identifies the status author.
          </p>
          <label className="text-sm">
            School{" "}
            <select
              className={selectStyle}
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            >
              <option value="">All eligible schools</option>
              {details.data?.schools
                .filter((s) => details.data?.details.some((r) => r.school_id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {details.isPending && <p role="status">Loading schools…</p>}
          {details.error && <p role="alert">{details.error.message}</p>}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">School / Centre</th>
                  <th className="p-2">Class / Division</th>
                  <th className="p-2">Trainer / Recorded by</th>
                  <th className="p-2">Completion status saved</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {details.data?.details
                  .filter((r) => !school || r.school_id === school)
                  .map((r) => {
                    const s = details.data?.schools.find((s) => s.id === r.school_id);
                    return (
                      <tr key={r.school_id} className="border-t align-top">
                        <td className="p-2">
                          {s?.name ?? r.school_id}
                          <span className="block text-xs">{s?.centre}</span>
                        </td>
                        <td className="p-2">
                          Class {klass}
                          {r.divisions.map((v) => (
                            <span className="block text-xs" key={v.division}>
                              Division {v.division || "Unspecified"}:{" "}
                              {v.status === "complete"
                                ? "Complete"
                                : v.status === "pending"
                                  ? "Pending"
                                  : "Not Recorded"}
                            </span>
                          ))}
                        </td>
                        <td className="p-2">
                          {s?.trainers.join(", ") || "Unassigned / unavailable"}
                          {r.divisions.map((v) => (
                            <span className="block text-xs" key={v.division}>
                              {v.division || "Unspecified"}: {v.updated_by ?? "Not recorded"}
                            </span>
                          ))}
                        </td>
                        <td className="p-2">
                          {r.status === "Completed" ? dateText(r.completion_updated_at) : "—"}
                        </td>
                        <td className="p-2 font-medium">{r.status}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {details.data && !details.data.details.length && (
            <p>No eligible schools for this session in the selected scope.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function AssessmentCoverageReference() {
  const [open, setOpen] = useState(false);
  const { can } = useAuth();
  if (!can("session_status", "view")) return null;
  return (
    <details className="rounded-xl border p-3" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">
        Review session coverage for assessment planning
      </summary>
      {open && <ClassSessionCoverage context="assessments" />}
    </details>
  );
}
