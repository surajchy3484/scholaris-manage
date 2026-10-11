import { missingDashboardFeature } from "./dashboard-compat";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requirePermission } from "./app-access.server";
import { resolveAcademicYear } from "./academic-db.server";
import { can } from "./access-control";
import { fetchAllRows } from "./fetch-all";
import { schoolOrganizationGroup } from "./organization-groups";
import {
  DEFAULT_COVERAGE_THRESHOLDS,
  type CoverageMetric,
  type CoverageDetail,
  type CoverageThresholds,
} from "./session-coverage";
const input = z.object({
  token: z.string().min(1),
  academicYear: z.string().optional(),
  class: z.enum(["5", "6", "7", "8", "9"]),
  centre: z.string().optional(),
  trainer: z.string().uuid().optional(),
  session: z.string().uuid().optional(),
  context: z.enum(["dashboard", "assessments"]).default("dashboard"),
});
export const getSessionCoverage = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, data.context, "view");
    if (!can(profile, "session_status", "view"))
      throw new Error("Session Status access is required to review topic coverage.");
    const year = await resolveAcademicYear(data.academicYear);
    const db = await adminDb();
    const schools = await fetchAllRows<{
      id: string;
      name: string;
      location: string;
      cluster_name: string | null;
    }>((from, to) => {
      let q = db.from("schools").select("id,name,location,cluster_name").order("id");
      if (profile.role !== "admin" && !profile.allSchools)
        q = q.in(
          "id",
          profile.schoolIds.length ? profile.schoolIds : ["00000000-0000-0000-0000-000000000000"],
        );
      return q.range(from, to);
    });
    // School assignment metadata only; no account secrets are returned.
    let trainers: {
      id: string;
      full_name: string;
      username: string;
      school_ids: string[];
      all_schools: boolean;
    }[] = [];
    if (profile.role === "admin")
      trainers = await fetchAllRows((from, to) =>
        db
          .from("app_users")
          .select("id,full_name,username,school_ids,all_schools")
          .eq("role", "trainer")
          .eq("is_active", true)
          .order("id")
          .range(from, to),
      );
    else
      trainers = [
        {
          id: profile.userId ?? "",
          full_name: profile.fullName,
          username: profile.username,
          school_ids: profile.schoolIds,
          all_schools: profile.allSchools,
        },
      ];
    const trainer = data.trainer ? trainers.find((t) => t.id === data.trainer) : undefined;
    if (data.trainer && !trainer) throw new Error("Trainer access denied");
    const visible = schools.map((s) => ({ ...s, centre: schoolOrganizationGroup(s) }));
    const selected = visible.filter(
      (s) =>
        (!data.centre || s.centre === data.centre) &&
        (!trainer || trainer.all_schools || trainer.school_ids.includes(s.id)),
    );
    const [result, settings] = await Promise.all([
      db.rpc(
        "reap_class_session_coverage" as never,
        {
          p_year: year,
          p_class: data.class,
          p_schools: selected.map((s) => s.id),
          p_session: data.session ?? null,
        } as never,
      ),
      db
        .from("session_coverage_settings" as never)
        .select("almost_all,partial")
        .eq("academic_year", year)
        .maybeSingle(),
    ]);
    const error = result.error || settings.error;
    if (error) {
      const setupMissing = ["reap_class_session_coverage", "session_coverage_settings"].some(
        (name) => missingDashboardFeature(error, name, ["PGRST202", "PGRST205", "42883", "42P01"]),
      );
      throw new Error(
        setupMissing
          ? "Class coverage setup is unavailable. Apply migration 20261011160000_class_session_coverage.sql, then retry."
          : "Could not load class session coverage. Please retry.",
      );
    }
    const payload = result.data as unknown as {
      metrics: CoverageMetric[];
      details: CoverageDetail[];
    };
    return {
      ...payload,
      year,
      thresholds: (settings.data as CoverageThresholds | null) ?? DEFAULT_COVERAGE_THRESHOLDS,
      centres: [...new Set(visible.map((s) => s.centre))].sort(),
      trainers: trainers.map((t) => ({ id: t.id, name: t.full_name || t.username })),
      schools: selected.map((s) => ({
        id: s.id,
        name: s.name,
        centre: s.centre,
        trainers: trainers
          .filter((t) => t.all_schools || t.school_ids.includes(s.id))
          .map((t) => t.full_name || t.username),
      })),
    };
  });
export const saveCoverageThresholds = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        token: z.string().min(1),
        academicYear: z.string().optional(),
        almost_all: z.number().gt(0).lt(100),
        partial: z.number().gt(0).lt(100),
      })
      .refine((v) => v.partial < v.almost_all, "Partial must be below Almost All")
      .parse(v),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "settings", "edit");
    if (profile.role !== "admin") throw new Error("Administrator access required");
    const year = await resolveAcademicYear(data.academicYear);
    const db = await adminDb();
    const { error } = await db
      .from("session_coverage_settings" as never)
      .upsert({ academic_year: year, almost_all: data.almost_all, partial: data.partial } as never);
    if (error) throw new Error("Could not save coverage thresholds");
    return { ok: true };
  });
