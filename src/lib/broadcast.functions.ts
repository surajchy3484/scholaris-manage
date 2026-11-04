/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, resolveAccess } from "./app-access.server";

const token = z.object({ token: z.string().min(1) });
const id = z.string().uuid();
const messageFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(20_000),
};

async function requireAdmin(rawToken: string) {
  const profile = await resolveAccess(rawToken);
  if (profile.role !== "admin") throw new Error("Only administrators can manage broadcasts.");
  return profile;
}

export const listBroadcasts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = (await adminDb()) as any;
    const { data: rows, error } = await db
      .from("broadcast_messages")
      .select("id,title,description,sender_name,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Unable to load broadcasts.");
    return rows ?? [];
  });

export const createBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend(messageFields).parse(data))
  .handler(async ({ data }) => {
    const profile = await requireAdmin(data.token);
    const db = (await adminDb()) as any;
    const { data: broadcast, error } = await db
      .from("broadcast_messages")
      .insert({
        title: data.title,
        description: data.description,
        sender_id: profile.userId,
        sender_name: profile.fullName || profile.username || "Administrator",
      })
      .select("id,title,description,sender_name,created_at,updated_at")
      .single();
    if (error || !broadcast) throw new Error("Unable to create broadcast.");

    const { data: trainers, error: trainerError } = await db
      .from("app_users")
      .select("id")
      .eq("is_active", true)
      .ilike("role", "trainer");
    if (trainerError) throw new Error("Broadcast created, but trainers could not be loaded.");
    const recipients = (trainers ?? []).map((trainer: { id: string }) => ({
      broadcast_id: broadcast.id,
      user_id: trainer.id,
    }));
    if (recipients.length) {
      const { error: recipientError } = await db
        .from("broadcast_recipients")
        // This is a new broadcast, so recipient rows cannot exist yet. A plain
        // insert avoids relying on PostgREST's conflict-target schema cache.
        .insert(recipients);
      if (recipientError) {
        console.error("[broadcast] unable to deliver broadcast", {
          code: recipientError.code,
          message: recipientError.message,
          details: recipientError.details,
          hint: recipientError.hint,
        });
        // Compatibility path for deployments where the broadcast migration
        // has not been applied yet. The existing notification table is already
        // used by the bell and supports user-specific read state.
        const fallbackRows = (trainers ?? []).map((trainer: { id: string }) => ({
          user_id: trainer.id,
          ticket_id: null,
          type: "broadcast",
          message: JSON.stringify({
            broadcast_id: broadcast.id,
            title: broadcast.title,
            description: broadcast.description,
            sender_name: broadcast.sender_name,
          }),
        }));
        const { error: fallbackError } = await db
          .from("support_notifications")
          .insert(fallbackRows);
        if (fallbackError) {
          console.error("[broadcast] compatibility delivery also failed", {
            code: fallbackError.code,
            message: fallbackError.message,
            details: fallbackError.details,
            hint: fallbackError.hint,
          });
          throw new Error("Broadcast created, but delivery could not be scheduled.");
        }
      }
    }
    return broadcast;
  });

export const updateBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ id, ...messageFields }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = (await adminDb()) as any;
    const { data: broadcast, error } = await db
      .from("broadcast_messages")
      .update({
        title: data.title,
        description: data.description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id,title,description,sender_name,created_at,updated_at")
      .single();
    if (error || !broadcast) throw new Error("Unable to update broadcast.");
    return broadcast;
  });

export const deleteBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ id }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = (await adminDb()) as any;
    const { error } = await db.from("broadcast_messages").delete().eq("id", data.id);
    if (error) throw new Error("Unable to delete broadcast.");
    return { ok: true };
  });
