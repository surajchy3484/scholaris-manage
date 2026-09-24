import { useEffect, useState } from "react";

import { clearAccessToken, storeAccessToken } from "@/lib/app-access";
import {
  can as canDo,
  canSeeSchool as canSeeSchoolFor,
  type AccessProfile,
  type AppAction,
  type AppModule,
} from "@/lib/access-control";

const KEY = "scholaris_auth_v1";

type Session = { user: string; remember: boolean; profile?: AccessProfile };

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Persist a signed-in account (token comes from the appLogin server function). */
export function loginWithProfile(profile: AccessProfile, token: string, remember: boolean) {
  const session: Session = { user: profile.username, remember, profile };
  const store = remember ? localStorage : sessionStorage;
  store.setItem(KEY, JSON.stringify(session));
  storeAccessToken(token, remember);
  window.dispatchEvent(new Event("scholaris:auth"));
}

export function logoutLocal() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  clearAccessToken();
  window.dispatchEvent(new Event("scholaris:auth"));
}

/** Replace the cached profile with fresh server-side permissions. */
export function updateStoredProfile(profile: AccessProfile) {
  const current = readSession();
  if (!current) return;
  const store = current.remember ? localStorage : sessionStorage;
  store.setItem(KEY, JSON.stringify({ ...current, profile, user: profile.username }));
  window.dispatchEvent(new Event("scholaris:auth"));
}

/**
 * Pull the latest permissions from the server so admin changes take effect
 * without the user signing out. Permissions are always re-checked server-side,
 * so this only keeps the visible menus honest.
 */
export async function refreshProfileFromServer() {
  if (typeof window === "undefined") return;
  if (!readSession()) return;
  try {
    const { currentProfile } = await import("@/lib/users.functions");
    const { getAccessToken } = await import("@/lib/app-access");
    const profile = await currentProfile({ data: { token: getAccessToken() } });
    updateStoredProfile(profile);
  } catch {
    // Offline or expired token: keep whatever we have; server calls will fail loudly.
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
    function sync() {
      setSession(readSession());
    }
    window.addEventListener("scholaris:auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("scholaris:auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const profile = session?.profile ?? null;

  return {
    session,
    profile,
    isAuthed: !!session,
    isAdmin: profile ? profile.role === "admin" : !!session && !profile,
    ready,
    /** Older sessions predate profiles, so treat them as full admins. */
    can: (module: AppModule, action: AppAction = "view") =>
      profile ? canDo(profile, module, action) : !!session,
    canSeeSchool: (schoolId: string) => (profile ? canSeeSchoolFor(profile, schoolId) : !!session),
  };
}
