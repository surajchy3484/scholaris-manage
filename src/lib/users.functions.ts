import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  defaultPermissions,
  sanitizePermissions,
  type AccessProfile,
  type Permissions,
} from "./access-control";
import {
  adminDb,
  hashPassword,
  issueToken,
  requireAdmin,
  resolveAccess,
  verifyPassword,
} from "./app-access.server";

/**
 * Account management for SchoolRise. Accounts live in `app_users`, which is
 * only reachable by privileged server code, so every read/write here is gated
 * by an admin session token.
 */

const LEGACY_ADMIN_USERNAME = "reapstem";

export type AppUserRow = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  permissions: Permissions;
  school_ids: string[];
  all_schools: boolean;
  last_login_at: string | null;
  login_count: number;
  created_at: string;
};

const SELECT_COLS =
  "id,username,full_name,email,phone,role,is_active,permissions,school_ids,all_schools,last_login_at,login_count,created_at";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export type LoginResult = { token: string; profile: AccessProfile };

export const appLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }): Promise<LoginResult> => {
    const username = data.username.trim().toLowerCase();
    const db = await adminDb();

    const { data: rows, error } = await db
      .from("app_users")
      .select(`${SELECT_COLS},password_hash`)
      .ilike("username", username)
      .limit(1);
    if (error) throw new Error("Sign in failed. Please try again.");

    let row = rows?.[0] as (AppUserRow & { password_hash: string }) | undefined;

    // Bootstrap: the very first sign-in creates the admin account from the
    // original shared operator credentials.
    if (!row) {
      const { count } = await db
        .from("app_users")
        .select("id", { count: "exact", head: true });
      const legacyPassword = process.env['APP_ACCESS_PASSWORD'] ?? "123456";
      if (
        (count ?? 0) === 0 &&
        username === LEGACY_ADMIN_USERNAME &&
        data.password === legacyPassword
      ) {
        const { data: created, error: insErr } = await db
          .from("app_users")
          .insert({
            username: LEGACY_ADMIN_USERNAME,
            full_name: "Administrator",
            role: "admin",
            password_hash: await hashPassword(data.password),
            all_schools: true,
            permissions: {},
          })
          .select(`${SELECT_COLS},password_hash`)
          .single();
        if (insErr || !created) throw new Error("Sign in failed. Please try again.");
        row = created as AppUserRow & { password_hash: string };
      }
    }

    if (!row) throw new Error("Invalid username or password.");
    if (!row.is_active) throw new Error("This account has been disabled.");
    if (!(await verifyPassword(data.password, row.password_hash))) {
      throw new Error("Invalid username or password.");
    }

    await db
      .from("app_users")
      .update({ last_login_at: new Date().toISOString(), login_count: (row.login_count ?? 0) + 1 })
      .eq("id", row.id);

    const role = row.role === "admin" ? "admin" : "trainer";
    return {
      token: await issueToken(row.id),
      profile: {
        userId: row.id,
        username: row.username,
        fullName: row.full_name ?? "",
        role,
        permissions: sanitizePermissions(row.permissions),
        schoolIds: (row.school_ids ?? []) as string[],
        allSchools: !!row.all_schools,
      },
    };
  });

const tokenSchema = z.object({ token: z.string().min(1) });

/** Refresh the signed-in profile (permissions may have changed server-side). */
export const currentProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<AccessProfile> => resolveAccess(data.token));

export const listUsers = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<AppUserRow[]> => {
    await requireAdmin(data.token);
    const db = await adminDb();
    const { data: rows, error } = await db
      .from("app_users")
      .select(SELECT_COLS)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Failed to load accounts");
    return (rows ?? []) as AppUserRow[];
  });

const upsertSchema = tokenSchema.extend({
  id: z.string().uuid().optional(),
  username: z.string().min(3).max(64),
  fullName: z.string().max(120).default(""),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  role: z.enum(["admin", "trainer"]),
  password: z.string().min(6).max(200).optional(),
  isActive: z.boolean().default(true),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  schoolIds: z.array(z.string().uuid()).max(500).default([]),
  allSchools: z.boolean().default(false),
});

export const saveUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await adminDb();
    const username = data.username.trim();
    const permissions =
      data.role === "admin"
        ? {}
        : sanitizePermissions(data.permissions ?? defaultPermissions("trainer"));

    const base = {
      username,
      full_name: data.fullName?.trim() ?? "",
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      role: data.role,
      is_active: data.isActive,
      permissions,
      school_ids: data.role === "admin" ? [] : data.schoolIds,
      all_schools: data.role === "admin" ? true : data.allSchools,
    };

    if (data.id) {
      const patch: Record<string, unknown> = { ...base };
      if (data.password) patch['password_hash'] = await hashPassword(data.password);
      const { error } = await db.from("app_users").update(patch).eq("id", data.id);
      if (error) {
        throw new Error(
          error.code === "23505" || error.message.includes("duplicate")
            ? "That username is already taken."
            : "Failed to save account",
        );
      }
      return { ok: true, id: data.id };
    }

    if (!data.password) throw new Error("A password is required for a new account.");
    const { data: created, error } = await db
      .from("app_users")
      .insert({ ...base, password_hash: await hashPassword(data.password) })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(
        error && (error.code === "23505" || error.message.includes("duplicate"))
          ? "That username is already taken."
          : "Failed to create account",
      );
    }
    return { ok: true, id: created.id };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    tokenSchema.extend({ id: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const me = await requireAdmin(data.token);
    if (me.userId === data.id && !data.isActive) {
      throw new Error("You cannot disable your own account.");
    }
    const db = await adminDb();
    const { error } = await db
      .from("app_users")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error("Failed to update account");
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    tokenSchema
      .extend({ id: z.string().uuid(), password: z.string().min(6).max(200) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await adminDb();
    const { error } = await db
      .from("app_users")
      .update({ password_hash: await hashPassword(data.password) })
      .eq("id", data.id);
    if (error) throw new Error("Failed to reset password");
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const me = await requireAdmin(data.token);
    if (me.userId === data.id) throw new Error("You cannot delete your own account.");
    const db = await adminDb();
    const { error } = await db.from("app_users").delete().eq("id", data.id);
    if (error) throw new Error("Failed to delete account");
    return { ok: true };
  });
