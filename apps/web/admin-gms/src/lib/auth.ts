import { logout } from "@grenmet/auth-client";

/** Cookie used by middleware to know if user has logged in (JWT stays in sessionStorage). */
export const AUTH_COOKIE_NAME = "grenmet_authenticated";

/** ~8 days in seconds, aligned with typical backend token expiry. */
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 8;

export function setAuthCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearAuthCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * Full sign-out: clear token from auth-client, clear auth cookie, redirect to sign-in.
 * Use from Sign out button and on 401.
 */
export function signOut(): void {
  if (typeof window === "undefined") return;
  logout();
  clearAuthCookie();
  window.location.href = "/signin";
}
