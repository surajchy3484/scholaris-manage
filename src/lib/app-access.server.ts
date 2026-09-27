/** Server-only authorization for administrator-approved app accounts. */
import {
  can,
  sanitizePermissions,
  type AccessProfile,
  type AppAction,
  type AppModule,
  type AppRole,
  type Permissions,
} from "./access-control";

const TOKEN_PREFIX = "st2.";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.APP_SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Error(
      "Private access setup required: configure APP_SESSION_SECRET with at least 32 random characters on the server.",
    );
  return value;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ---------- password hashing (PBKDF2-SHA256) ---------- */

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return hex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${digest}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const digest = await pbkdf2(password, unhex(parts[2]), iterations);
  return timingSafeEqual(digest, parts[3]);
}

/** ---------- session tokens ---------- */

type TokenPayload = { uid: string; exp: number; credential: string };

async function credentialVersion(passwordHash: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(passwordHash))));
}

export async function issueToken(userId: string, passwordHash: string): Promise<string> {
  const payload: TokenPayload = {
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
    credential: await credentialVersion(passwordHash),
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${TOKEN_PREFIX}${body}.${await hmac(body)}`;
}

async function readToken(token: string): Promise<TokenPayload | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [body, sig] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqual(sig, await hmac(body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TokenPayload;
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function adminDb() {
  const { getSupabaseAdmin } = await import("./supabase-admin.server");
  return getSupabaseAdmin();
}

/** Resolve the caller behind a token, or throw. */
export async function resolveAccess(token: string): Promise<AccessProfile> {
  if (!token) throw new Error("Unauthorized");

  if (!token.startsWith(TOKEN_PREFIX)) throw new Error("Sign in with an approved account.");

  const payload = await readToken(token);
  if (!payload) throw new Error("Session expired. Please sign in again.");

  const db = await adminDb();
  const { data, error } = await db
    .from("app_users")
    .select("id,username,full_name,role,is_active,permissions,school_ids,all_schools,password_hash")
    .eq("id", payload.uid)
    .maybeSingle();
  if (error) throw new Error("Unauthorized");
  if (!data) throw new Error("Unauthorized");
  if (payload.credential !== (await credentialVersion(data.password_hash)))
    throw new Error("Session expired. Please sign in again.");
  if (!data.is_active) throw new Error("This account has been disabled.");

  return {
    userId: data.id,
    username: data.username,
    fullName: data.full_name ?? "",
    role: (data.role === "admin" ? "admin" : "trainer") as AppRole,
    permissions: sanitizePermissions(data.permissions) as Permissions,
    schoolIds: (data.school_ids ?? []) as string[],
    allSchools: !!data.all_schools,
  };
}

/** Back-compat: any signed-in account passes. */
export async function assertAccess(token: string): Promise<AccessProfile> {
  return resolveAccess(token);
}

export async function requirePermission(
  token: string,
  module: AppModule,
  action: AppAction = "view",
): Promise<AccessProfile> {
  const profile = await resolveAccess(token);
  if (!can(profile, module, action)) {
    throw new Error(`Access Denied: ${action} permission is required for ${module}.`);
  }
  return profile;
}

export async function requireAdmin(token: string): Promise<AccessProfile> {
  const profile = await resolveAccess(token);
  if (profile.role !== "admin") throw new Error("Admin access required.");
  return profile;
}
