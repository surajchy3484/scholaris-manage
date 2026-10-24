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
    const db = await adminDb();
    const { error } = await db.from("support_tickets").insert({
      created_by: profile.userId,
      username: profile.username,
      full_name: profile.fullName || profile.username,
      role: profile.role,
      subject: data.subject,
      description: data.description,
    });
    if (error) throw new Error("Unable to submit your ticket. Please try again.");
    return { ok: true };
  });

export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token }).parse(data))
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    const profile = await resolveAccess(data.token);
    if (profile.role !== "admin") throw new Error("Only administrators can view support tickets.");
    const db = await adminDb();
    const { data: rows, error } = await db
      .from("support_tickets")
      .select("id,username,full_name,role,subject,description,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Unable to load support tickets.");
    return (rows ?? []) as SupportTicket[];
  });

export const updateSupportTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      token,
      id: z.string().uuid(),
      status: z.enum(["open", "in_progress", "resolved"]),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const profile = await resolveAccess(data.token);
    if (profile.role !== "admin") throw new Error("Only administrators can update support tickets.");
    const db = await adminDb();
    const { error } = await db
      .from("support_tickets")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Unable to update ticket status.");
    return { ok: true };
  });
