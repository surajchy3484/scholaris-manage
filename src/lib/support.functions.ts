/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { can, canSeeSchool, type AccessProfile } from "./access-control";
import { academicDb } from "./academic-db.server";
import { adminDb, requirePermission, resolveAccess } from "./app-access.server";

const token = z.object({ token: z.string().min(1), academicYear: z.string().max(80).optional() });
const categories = [
  "Student Data",
  "Attendance",
  "Session Status",
  "Assessment/Exam",
  "Dashboard/Reports",
  "User Access/Login",
  "Technical Issue",
  "Data Import/Export",
  "Feature Request",
  "Other",
] as const;
const priorities = ["Low", "Medium", "High", "Critical"] as const;
const statuses = [
  "Open",
  "Under Review",
  "In Progress",
  "Pending User Response",
  "Resolved",
  "Closed",
  "Reopened",
] as const;
const ticketId = z.string().uuid();
type ActivityRow = { action?: string };
type SummaryRow = { status: string; category: string; priority: string };

function canAny(
  profile: AccessProfile,
  ...actions: (keyof NonNullable<AccessProfile["permissions"]> | string)[]
) {
  return (
    profile.role === "admin" || actions.some((action) => can(profile, "support", action as never))
  );
}
function canManage(profile: AccessProfile) {
  return canAny(profile, "manage");
}
function canSeeTicket(
  profile: AccessProfile,
  row: { creator_id: string; school_id: string | null },
) {
  return (
    canManage(profile) ||
    row.creator_id === profile.userId ||
    (!!row.school_id &&
      canSeeSchool(profile, row.school_id) &&
      can(profile, "support", "view" as never))
  );
}
function assertTicketAccess(
  profile: AccessProfile,
  row: { creator_id: string; school_id: string | null },
) {
  if (!canSeeTicket(profile, row)) throw new Error("You are not authorized to access this ticket.");
}

export const listSupportSchools = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "raise", "manage")) throw new Error("Support access is required.");
    const db = await adminDb();
    let q = db.from("schools").select("id,name,code,location").order("name").order("id");
    if (profile.role !== "admin" && !profile.allSchools) q = q.in("id", profile.schoolIds);
    const { data: rows, error } = await q;
    if (error) throw new Error("Unable to load authorized schools.");
    return rows ?? [];
  });

export const listSupportRoster = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ schoolId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "raise", "manage")) throw new Error("Support access is required.");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied.");
    const db = (await academicDb(data.academicYear)) as any;
    const { data: rows, error } = await db
      .from("students")
      .select("class,division")
      .eq("school_id", data.schoolId)
      .order("class")
      .order("division");
    if (error) throw new Error("Unable to load class and division options.");
    const pairs = new Map<string, { class: string; division: string }>();
    for (const row of rows ?? [])
      if (row.class)
        pairs.set(`${row.class}|${row.division ?? ""}`, {
          class: row.class,
          division: row.division ?? "",
        });
    return [...pairs.values()];
  });

const attachment = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().max(120),
  dataUrl: z.string().max(14_000_000),
});
const createSchema = token.extend({
  subject: z.string().trim().min(3).max(240),
  category: z.enum(categories),
  priority: z.enum(priorities),
  description: z.string().trim().min(10).max(20_000),
  schoolId: z.string().uuid().nullable().optional(),
  className: z.string().trim().max(100).nullable().optional(),
  division: z.string().trim().max(100).nullable().optional(),
  attachments: z.array(attachment).max(5).optional(),
});
export const createSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "support", "raise" as never);
    if (data.schoolId && !canSeeSchool(profile, data.schoolId))
      throw new Error("School access denied.");
    const db = (await academicDb(data.academicYear)) as any;
    const { data: row, error } = await db
      .from("support_tickets")
      .insert({
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        description: data.description,
        creator_id: profile.userId,
        creator_name: profile.fullName || profile.username,
        creator_designation: profile.role,
        // Keep compatibility with the first support_tickets schema, which
        // required these legacy identity columns.
        created_by: profile.userId,
        username: profile.username,
        full_name: profile.fullName || profile.username,
        role: profile.role,
        school_id: data.schoolId ?? null,
        class: data.className ?? null,
        division: data.division ?? null,
        academic_year: data.academicYear ?? "2026",
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Unable to create ticket.");
    await db.from("support_ticket_activity").insert({
      ticket_id: row.id,
      actor_id: profile.userId,
      actor_name: profile.fullName || profile.username,
      action: "created",
      new_value: row.status,
    });
    const usersDb = (await adminDb()) as any;
    const { data: recipients, error: recipientsError } = await usersDb
      .from("app_users")
      .select("id,role,permissions")
      .eq("is_active", true);
    if (recipientsError) {
      console.error("[support] unable to find ticket notification recipients", recipientsError);
    } else {
      const recipientIds = [...new Set(
        (recipients ?? [])
          .filter((user: any) => {
            if (!user.id || user.id === profile.userId) return false;
            if (["admin", "administrator", "super admin", "super_admin"].includes(String(user.role).trim().toLowerCase())) return true;
            const supportActions = user.permissions?.support;
            return Array.isArray(supportActions) && supportActions.includes("manage");
          })
          .map((user: any) => user.id as string),
      )];
      if (recipientIds.length) {
        const { error: notificationError } = await usersDb.from("support_notifications").insert(
          recipientIds.map((userId: string) => ({
            user_id: userId,
            ticket_id: row.id,
            type: "new_ticket",
            message: `${row.ticket_id}: ${row.subject}`,
          })),
        );
        if (notificationError) {
          console.error("[support] unable to create new-ticket notifications", {
            code: notificationError.code,
            message: notificationError.message,
          });
        }
      } else {
        console.warn("[support] no active admin/support managers found for new ticket", row.ticket_id);
      }
    }
    const files = data.attachments ?? [];
    for (const file of files) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl);
      if (!match) continue;
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.byteLength > 10 * 1024 * 1024)
        throw new Error("Each attachment must be 10 MB or smaller.");
      const path = `${row.id}/${crypto.randomUUID()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await db.storage
        .from("ticket-attachments")
        .upload(path, bytes, { contentType: file.contentType || match[1], upsert: false });
      if (upload.error) throw new Error("Ticket created, but an attachment could not be uploaded.");
      await db.from("support_ticket_attachments").insert({
        ticket_id: row.id,
        uploaded_by: profile.userId,
        filename: file.filename,
        content_type: file.contentType || match[1],
        size_bytes: bytes.byteLength,
        storage_path: path,
      });
    }
    return row;
  });

const listSchema = token.extend({
  status: z.enum(statuses).optional(),
  category: z.enum(categories).optional(),
  priority: z.enum(priorities).optional(),
  search: z.string().trim().max(160).optional(),
  schoolId: z.string().uuid().optional(),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "manage")) throw new Error("Support access is required.");
    const db = (await academicDb(data.academicYear)) as any;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = db
      .from("support_tickets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (!canManage(profile)) {
      if (profile.userId) q = q.eq("creator_id", profile.userId);
      if (profile.role !== "admin" && !profile.allSchools && profile.schoolIds.length)
        q = q.in("school_id", profile.schoolIds);
    } else if (data.schoolId) q = q.eq("school_id", data.schoolId);
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.search) q = q.or(`ticket_id.ilike.%${data.search}%,subject.ilike.%${data.search}%`);
    const { data: rows, error, count } = await q;
    if (error) throw new Error("Unable to load tickets.");
    return {
      rows: rows ?? [],
      count: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      canManage: canManage(profile),
    };
  });

export const getSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ id: ticketId }).parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    const db = (await academicDb(data.academicYear)) as any;
    const { data: ticket, error } = await db
      .from("support_tickets")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !ticket) throw new Error("Ticket not found.");
    assertTicketAccess(profile, ticket);
    let replies = db
      .from("support_ticket_replies")
      .select("*")
      .eq("ticket_id", data.id)
      .order("created_at");
    if (!canManage(profile)) replies = replies.eq("visibility", "public");
    const [replyResult, activityResult, attachmentResult] = await Promise.all([
      replies,
      db.from("support_ticket_activity").select("*").eq("ticket_id", data.id).order("created_at"),
      db
        .from("support_ticket_attachments")
        .select("id,filename,content_type,size_bytes,created_at,uploaded_by")
        .eq("ticket_id", data.id)
        .order("created_at"),
    ]);
    if (replyResult.error || activityResult.error || attachmentResult.error)
      throw new Error("Unable to load ticket history.");
    return {
      ticket,
      replies: replyResult.data ?? [],
      activity: canManage(profile)
        ? (activityResult.data ?? [])
        : (activityResult.data as ActivityRow[]).filter((a) => a.action !== "internal_note"),
      attachments: attachmentResult.data ?? [],
      canManage: canManage(profile),
    };
  });

const replySchema = token.extend({
  id: ticketId,
  message: z.string().trim().min(1).max(20_000),
  internal: z.boolean().default(false),
});
export const replySupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => replySchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    const db = (await academicDb(data.academicYear)) as any;
    const { data: ticket, error } = await db
      .from("support_tickets")
      .select("id,creator_id,school_id")
      .eq("id", data.id)
      .single();
    if (error || !ticket) throw new Error("Ticket not found.");
    assertTicketAccess(profile, ticket);
    if (data.internal && !canAny(profile, "internal_note", "manage"))
      throw new Error("Internal note permission is required.");
    if (
      !data.internal &&
      !canAny(profile, "reply", "manage") &&
      ticket.creator_id !== profile.userId
    )
      throw new Error("Reply permission is required.");
    const { error: insertError } = await db.from("support_ticket_replies").insert({
      ticket_id: data.id,
      sender_id: profile.userId,
      sender_name: profile.fullName || profile.username,
      message: data.message,
      visibility: data.internal ? "internal" : "public",
    });
    if (insertError) throw new Error("Unable to send reply.");
    await db.from("support_ticket_activity").insert({
      ticket_id: data.id,
      actor_id: profile.userId,
      actor_name: profile.fullName || profile.username,
      action: data.internal ? "internal_note" : "reply",
      new_value: data.message.slice(0, 180),
    });
    const recipient = data.internal
      ? null
      : ticket.creator_id === profile.userId
        ? null
        : ticket.creator_id;
    if (recipient)
      await db.from("support_notifications").insert({
        user_id: recipient,
        ticket_id: data.id,
        type: "reply",
        message: `${profile.fullName || profile.username} replied to your ticket.`,
      });
    return { ok: true };
  });

const updateSchema = token.extend({
  id: ticketId,
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  resolutionDetails: z.string().max(20_000).nullable().optional(),
});
export const updateSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "support", "manage");
    const db = (await academicDb(data.academicYear)) as any;
    const { data: previous, error } = await db
      .from("support_tickets")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !previous) throw new Error("Ticket not found.");
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.priority) patch.priority = data.priority;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
    if (data.resolutionDetails !== undefined) patch.resolution_details = data.resolutionDetails;
    if (data.status === "Resolved") patch.resolved_at = new Date().toISOString();
    if (data.status === "Closed") patch.closed_at = new Date().toISOString();
    const { data: updated, error: updateError } = await db
      .from("support_tickets")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error("Unable to update ticket.");
    const events = Object.entries(patch)
      .filter(([key]) => !["resolved_at", "closed_at"].includes(key))
      .map(([key, value]) => ({
        ticket_id: data.id,
        actor_id: profile.userId,
        actor_name: profile.fullName || profile.username,
        action:
          key === "assigned_to"
            ? "assignment"
            : key === "status"
              ? "status_change"
              : "priority_change",
        previous_value: String(previous[key] ?? ""),
        new_value: String(value ?? ""),
      }));
    if (events.length) await db.from("support_ticket_activity").insert(events);
    if (data.status && data.status !== previous.status)
      await db.from("support_notifications").insert({
        user_id: previous.creator_id,
        ticket_id: data.id,
        type: "status",
        message: `Your ticket ${previous.ticket_id} is now ${data.status}.`,
      });
    if (data.assignedTo && data.assignedTo !== previous.assigned_to)
      await db.from("support_notifications").insert({
        user_id: data.assignedTo,
        ticket_id: data.id,
        type: "assignment",
        message: `You were assigned ticket ${previous.ticket_id}.`,
      });
    return updated;
  });

export const getSupportSummary = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "manage")) throw new Error("Support access is required.");
    const db = (await academicDb(data.academicYear)) as any;
    let q = db
      .from("support_tickets")
      .select("status,category,priority,school_id,created_at,resolved_at");
    if (!canManage(profile) && profile.userId) q = q.eq("creator_id", profile.userId);
    else if (profile.role !== "admin" && !profile.allSchools)
      q = q.in("school_id", profile.schoolIds);
    const { data: rows, error } = await q;
    if (error) throw new Error("Unable to load ticket summary.");
    const list = (rows ?? []) as SummaryRow[];
    return {
      total: list.length,
      open: list.filter((r) => r.status === "Open" || r.status === "Reopened").length,
      inProgress: list.filter((r) => r.status === "In Progress" || r.status === "Under Review")
        .length,
      pending: list.filter((r) => r.status === "Pending User Response").length,
      resolved: list.filter((r) => r.status === "Resolved" || r.status === "Closed").length,
      byCategory: categories.map((category) => ({
        category,
        count: list.filter((r) => r.category === category).length,
      })),
      byPriority: priorities.map((priority) => ({
        priority,
        count: list.filter((r) => r.priority === priority).length,
      })),
      byStatus: statuses.map((status) => ({
        status,
        count: list.filter((r) => r.status === status).length,
      })),
    };
  });

const deleteTicketSchema = token.extend({ id: ticketId });
export const deleteSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteTicketSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "support", "manage");
    const db = (await academicDb(data.academicYear)) as any;
    const { error, count } = await db
      .from("support_tickets")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) {
      console.error("[support] delete ticket failed", { code: error.code, message: error.message });
      throw new Error("Unable to delete ticket. Please try again.");
    }
    // Supabase may not return a row count for this client configuration; a
    // successful delete is still considered successful.
    return { ok: true, deleted: count ?? null };
  });

const notificationIdSchema = token.extend({ id: z.string().uuid() });

export const listSupportNotifications = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "manage")) throw new Error("Support access is required.");
    const db = (await academicDb(data.academicYear)) as any;
    let recipientIds: string[] = profile.userId ? [profile.userId] : [];
    // The legacy shared Administrator login has no app_users ID. For that
    // session, show notifications delivered to active admin/support managers.
    if (!profile.userId && profile.role === "admin") {
      const usersDb = (await adminDb()) as any;
      const { data: recipients, error: recipientsError } = await usersDb
        .from("app_users")
        .select("id,role,permissions")
        .eq("is_active", true);
      if (recipientsError) throw new Error("Unable to load support notification recipients.");
      recipientIds = (recipients ?? [])
        .filter((user: any) =>
          ["admin", "administrator", "super admin", "super_admin"].includes(String(user.role).trim().toLowerCase()) ||
          (Array.isArray(user.permissions?.support) && user.permissions.support.includes("manage")),
        )
        .map((user: any) => user.id as string);
    }
    if (!recipientIds.length) return { rows: [], unreadCount: 0 };
    const { data: rows, error } = await db
      .from("support_notifications")
      .select("id,ticket_id,type,message,read_at,created_at")
      .in("user_id", recipientIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Unable to load support notifications.");
    const { count: unreadCount, error: unreadError } = await db
      .from("support_notifications")
      .select("id", { count: "exact", head: true })
      .in("user_id", recipientIds)
      .is("read_at", null);
    if (unreadError) throw new Error("Unable to count support notifications.");
    const rawRows = (rows ?? []) as Array<Record<string, unknown>>;
    const ticketIds = rawRows.map((row) => row.ticket_id).filter(Boolean) as string[];
    const tickets = ticketIds.length
      ? await db
          .from("support_tickets")
          .select("id,ticket_id,subject,creator_name,school_id")
          .in("id", ticketIds)
      : { data: [], error: null };
    if (tickets.error) throw new Error("Unable to load notification tickets.");
    const schoolIds = (tickets.data ?? []).map((ticket: any) => ticket.school_id).filter(Boolean);
    const schools = schoolIds.length
      ? await db.from("schools").select("id,name").in("id", schoolIds)
      : { data: [], error: null };
    if (schools.error) throw new Error("Unable to load notification schools.");
    const ticketMap = new Map<string, any>(
      (tickets.data ?? []).map((ticket: any) => [ticket.id, ticket] as [string, any]),
    );
    const schoolMap = new Map((schools.data ?? []).map((school: any) => [school.id, school.name]));
    return {
      rows: rawRows.map((row) => {
        const ticketId = typeof row.ticket_id === "string" ? row.ticket_id : null;
        const ticket = ticketId ? ticketMap.get(ticketId) : null;
        return {
          ...row,
          ticket: ticket
            ? {
                ...ticket,
                school_name: ticket.school_id ? (schoolMap.get(ticket.school_id) ?? null) : null,
              }
            : null,
        };
      }),
      unreadCount: unreadCount ?? rawRows.filter((row) => !row.read_at).length,
    };
  });

export const markSupportNotificationRead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => notificationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "manage"))
      throw new Error("Support access is required.");
    const db = (await academicDb(data.academicYear)) as any;
    let query = db
      .from("support_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (profile.userId) query = query.eq("user_id", profile.userId);
    else if (profile.role !== "admin") throw new Error("Support access is required.");
    const { error } = await query;
    if (error) throw new Error("Unable to mark notification as read.");
    return { ok: true };
  });

export const markAllSupportNotificationsRead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (!canAny(profile, "view", "manage"))
      throw new Error("Support access is required.");
    const db = (await academicDb(data.academicYear)) as any;
    let recipientIds: string[] = profile.userId ? [profile.userId] : [];
    if (!profile.userId && profile.role === "admin") {
      const usersDb = (await adminDb()) as any;
      const { data: recipients, error: recipientsError } = await usersDb
        .from("app_users")
        .select("id,role,permissions")
        .eq("is_active", true);
      if (recipientsError) throw new Error("Unable to load support notification recipients.");
      recipientIds = (recipients ?? [])
        .filter((user: any) =>
          String(user.role).toLowerCase() === "admin" ||
          (Array.isArray(user.permissions?.support) && user.permissions.support.includes("manage")),
        )
        .map((user: any) => user.id as string);
    }
    if (!recipientIds.length) return { ok: true };
    const { error } = await db
      .from("support_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("user_id", recipientIds)
      .is("read_at", null);
    if (error) throw new Error("Unable to mark notifications as read.");
    return { ok: true };
  });
