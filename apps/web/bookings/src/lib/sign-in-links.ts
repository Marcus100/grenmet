// Where a guest on the public booking page goes to sign in or create an account,
// and how they come back to the same page signed in.
//
// Both links end at the bookings app's own `/signin?returnTo=/<slug>`, which
// hands off to auth (single sign-on) and lands on the booking page with a
// bookings session. Creating an account on auth does not sign the person in to
// this app by itself, so the sign-up link names that address as its return
// target. Auth refuses any return origin that is not on its allow-list; the
// bookings origin is on it (AUTH_ALLOWED_RETURN_HOSTS in the deploy compose).

interface HeaderReader {
  get: (name: string) => string | null;
}

const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/iu;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(?::\d+)?$/iu;

/** This app's `/signin` address for a business, a relative path. */
export function signInPath(slug: string): string {
  return `/signin?${new URLSearchParams({ returnTo: `/${slug}` })}`;
}

/**
 * This app's own origin as the visitor reached it (the proxy chain sets the
 * forwarded host and protocol), or null when the headers do not give a usable
 * one. The result is only ever a suggestion to auth, which validates it.
 */
function ownOrigin(incoming: HeaderReader): string | null {
  const host = (incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "")
    .split(",")[0]
    ?.trim();
  if (!(host && HOST.test(host))) {
    return null;
  }
  const forwarded = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : LOCAL_HOST.test(host)
        ? "http"
        : "https";
  return `${scheme}://${host}`;
}

/**
 * The auth app's sign-up page, returning the person signed in to this
 * business's booking page. Without a usable own origin it is the plain sign-up
 * page (the person is then signed up but not signed in here).
 */
export function signUpHref(
  authAppUrl: string,
  incoming: HeaderReader,
  slug: string
): string {
  const url = new URL("/signup", authAppUrl);
  const origin = ownOrigin(incoming);
  if (origin) {
    url.searchParams.set("returnTo", `${origin}${signInPath(slug)}`);
  }
  return url.toString();
}
