/**
 * Roles, modules and per-action permissions for SchoolRise accounts.
 *
 * This file is client-safe: it only describes the shape of permissions and the
 * defaults for each role. Enforcement lives in app-access.server.ts.
 */

export type AppRole = "admin" | "trainer";

export const MODULES = [
  "dashboard",
  "schools",
  "students",
  "attendance",
  "exam_report",
  "assessments",
  "questions",
  "clicker",
  "session_status",
  "settings",
  "users",
] as const;

export type AppModule = (typeof MODULES)[number];

export const ACTIONS = ["view", "add", "edit", "delete", "import", "export", "status"] as const;
export type AppAction = (typeof ACTIONS)[number];

export type Permissions = Partial<Record<AppModule, AppAction[]>>;

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Dashboard",
  schools: "Schools",
  students: "Student Management",
  attendance: "Attendance",
  exam_report: "Exam Report",
  assessments: "Assessment Master",
  questions: "Question Master",
  clicker: "Clicker Data",
  session_status: "Session Status",
  settings: "Settings",
  users: "User Access",
};

/** Landing route for each module, used by menus and the access guard. */
export const MODULE_ROUTES: Record<AppModule, string> = {
  dashboard: "/",
  schools: "/",
  students: "/",
  attendance: "/",
  exam_report: "/exam-report",
  assessments: "/assessments",
  questions: "/questions",
  clicker: "/clicker",
  session_status: "/session-status",
  settings: "/settings",
  users: "/users",
};

export const ACTION_LABELS: Record<AppAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
  import: "Import",
  export: "Export",
  status: "Change Status",
};

const ALL_ACTIONS: AppAction[] = [...ACTIONS];

/** Admins implicitly get everything; this is only used for display. */
export const ADMIN_PERMISSIONS: Permissions = MODULES.reduce((acc, m) => {
  acc[m] = ALL_ACTIONS;
  return acc;
}, {} as Permissions);

/** Default STEM Trainer access. */
export const TRAINER_PERMISSIONS: Permissions = {
  dashboard: ["view"],
  session_status: ["view", "edit", "import", "status"],
  attendance: ["view", "add", "edit"],
  exam_report: ["view", "export"],
  students: ["view", "add", "export"],
  assessments: ["view", "edit"],
  questions: ["view", "edit"],
  clicker: ["view", "edit"],
};

export function defaultPermissions(role: AppRole): Permissions {
  return role === "admin" ? ADMIN_PERMISSIONS : TRAINER_PERMISSIONS;
}

export type AccessProfile = {
  userId: string | null;
  username: string;
  fullName: string;
  role: AppRole;
  permissions: Permissions;
  schoolIds: string[];
  allSchools: boolean;
};

export function can(
  profile: Pick<AccessProfile, "role" | "permissions"> | null | undefined,
  module: AppModule,
  action: AppAction = "view",
): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return (profile.permissions?.[module] ?? []).includes(action);
}

export function canSeeSchool(
  profile: Pick<AccessProfile, "role" | "allSchools" | "schoolIds"> | null | undefined,
  schoolId: string,
): boolean {
  if (!profile) return false;
  if (profile.role === "admin" || profile.allSchools) return true;
  return profile.schoolIds.includes(schoolId);
}

export function sanitizePermissions(input: unknown): Permissions {
  const out: Permissions = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(MODULES as readonly string[]).includes(key)) continue;
    if (!Array.isArray(value)) continue;
    const actions = value.filter((a): a is AppAction =>
      (ACTIONS as readonly string[]).includes(a as string),
    );
    if (actions.length) out[key as AppModule] = actions;
  }
  return out;
}
