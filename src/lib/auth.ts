import { useEffect, useState } from "react";

const KEY = "scholaris_auth_v1";
const CREDS = { username: "reapstem", password: "123456" };

type Session = { user: string; remember: boolean };

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

export function verifyCredentials(username: string, password: string): boolean {
  return (
    username.trim().toLowerCase() === CREDS.username &&
    password === CREDS.password
  );
}

export function loginLocal(username: string, remember: boolean, password?: string) {
  const session: Session = { user: username, remember };
  const store = remember ? localStorage : sessionStorage;
  store.setItem(KEY, JSON.stringify(session));
  if (password) storeAccessToken(password, remember);
  // Notify listeners in this tab
  window.dispatchEvent(new Event("scholaris:auth"));
}

export function logoutLocal() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  clearAccessToken();
  window.dispatchEvent(new Event("scholaris:auth"));
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

  return { session, isAuthed: !!session, ready };
}
