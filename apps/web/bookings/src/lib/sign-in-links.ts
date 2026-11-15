// Where a guest on the public booking page goes to sign in or create an account,
// and how they come back to the same page signed in.
//
// Both links end at the bookings app's own `/signin?returnTo=/<slug>`, which
// hands off to auth (single sign-on) and lands on the booking page with a
// bookings session. Creating an account on auth does not sign the person in to
// this app by itself, so the sign-up link names that address as its return
// target. Auth refuses any return origin that is not on its allow-list; the
// bookings origin is on it (AUTH_ALLOWED_RETURN_HOSTS in the deploy compose).
//
// This app's own origin comes from configuration (NEXT_PUBLIC_SITE_URL), never
// from request headers, which a visitor can influence.

/** This app's `/signin` address for a business, a relative path. */
export function signInPath(slug: string): string {
  return `/signin?${new URLSearchParams({ returnTo: `/${slug}` })}`;
}

/** The origin of a configured address, or null when it is unset or unusable. */
function originOf(address: string | undefined): string | null {
  if (!address) {
    return null;
  }
  try {
    const url = new URL(address);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * The auth app's sign-up page, returning the person signed in to this
 * business's booking page. Without a usable own address (`ownUrl` unset) it is
 * the plain sign-up page: the person is then signed up but not signed in here.
 */
export function signUpHref(
  authAppUrl: string,
  ownUrl: string | undefined,
  slug: string
): string {
  const url = new URL("/signup", authAppUrl);
  const origin = originOf(ownUrl);
  if (origin) {
    url.searchParams.set("returnTo", `${origin}${signInPath(slug)}`);
  }
  return url.toString();
}
