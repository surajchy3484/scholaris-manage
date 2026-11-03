/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, resolveAccess } from "./app-access.server";

const token = z.string().min(1);
const submitSchema = z.object({
  token,
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(10000),
});

export type SupportTicket = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
};

export const createSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const profile = await resolveAccess(data.token);
    if (profile.role === "admin") {
      // Admins may raise tickets too, but the same identity is recorded.
    }
    const db = (await adminDb()) as any;
    const { error } = await db.from("support_tickets").insert({
      created_by: profile.userId,
      username: profile.username,
      full_name: profile.fullName || profile.username,
      role: profile.role,
      subject: data.subject,
      description: data.description,
    });
    if (error) {
      // Keep database details in server logs so the real cause can be diagnosed
      // without exposing SQL or schema details to users.
      console.error("[support-tickets] insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .*support_tickets.* does not exist|could not find the table .*support_tickets/i.test(
          error.message,
        )
      ) {
        throw new Error(
          "Support tickets are not configured in the database yet. An administrator must apply the support_tickets migration in Supabase, then try again.",
        );
      }
      if (error.code === "23503") {
        throw new Error(
          "Your account could not be linked to the support ticket. Please sign out and sign in again, then retry.",
        );
      }
      throw new Error(
        "Unable to save your ticket. Please try again. If it continues, ask the administrator to check the server logs.",
      );
    }
    return { ok: true };
  });

export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token }).parse(data))
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    const profile = await resolveAccess(data.token);
    if (profile.role !== "admin") throw new Error("Only administrators can view support tickets.");
    const db = (await adminDb()) as any;
    const { data: rows, error } = await db
      .from("support_tickets")
      .select("id,username,full_name,role,subject,description,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Unable to load support tickets.");
    return (rows ?? []) as SupportTicket[];
  });

export const listMySupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token }).parse(data))
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    const profile = await resolveAccess(data.token);
    const db = (await adminDb()) as any;
    const { data: rows, error } = await db
      .from("support_tickets")
      .select("id,username,full_name,role,subject,description,status,created_at,updated_at")
      .eq("created_by", profile.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Unable to load your support ticket history.");
    return (rows ?? []) as SupportTicket[];
  });

export const updateSupportTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token,
        id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved"]),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const profile = await resolveAccess(data.token);
    if (profile.role !== "admin")
      throw new Error("Only administrators can update support tickets.");
    const db = (await adminDb()) as any;
    const { error } = await db
      .from("support_tickets")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Unable to update ticket status.");
    return { ok: true };
  });

export const deleteSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token,
        id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const profile = await resolveAccess(data.token);
    if (profile.role !== "admin")
      throw new Error("Only administrators can delete support tickets.");
    const db = (await adminDb()) as any;
    const { error } = await db.from("support_tickets").delete().eq("id", data.id);
    if (error) {
      console.error("[support-tickets] delete failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new Error("Unable to delete this ticket. Please try again.");
    }
    return { ok: true };
  });
