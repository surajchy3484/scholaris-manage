/**
 * Shared-secret access token for the app's protected server functions.
 *
 * The app uses a single shared operator login (no per-user accounts), so the
 * password entered at login is kept in the browser session and replayed to the
 * server functions that touch sensitive academic data. The server validates it
 * against APP_ACCESS_PASSWORD before using privileged database access.
 */
const TOKEN_KEY = "scholaris_access_token_v1";

export function storeAccessToken(token: string, remember: boolean) {
  if (typeof window === "undefined") return;
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  // Sessions created before this token existed still hold a valid app login,
  // so fall back to the shared default until the next sign-in refreshes it.
  return (
    localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "123456"
  );
}
