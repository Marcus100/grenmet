import type { Route } from "next";

/**
 * A path on this app that keeps what the person came in with: the return
 * address (validated upstream by getSafeReturnTo), the requested app's name for
 * the heading, and the sign-in method. Empty values are left out of the URL.
 */
export function signInPath(
  path: string,
  options: {
    app?: string | null;
    method?: "password";
    returnTo?: string | null;
  } = {}
): Route {
  const query = new URLSearchParams();
  if (options.app) query.set("app", options.app);
  if (options.method) query.set("method", options.method);
  if (options.returnTo) query.set("returnTo", options.returnTo);
  const text = query.toString();
  // Typed routes cannot see the query string, so the cast is the same one the
  // admin sign-in uses for its hand-off links.
  return (text ? `${path}?${text}` : path) as Route;
}
