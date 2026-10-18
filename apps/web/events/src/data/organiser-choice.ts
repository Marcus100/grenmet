import "server-only";

import { cookies } from "next/headers";

export const ORGANISER_COOKIE = "events_organiser";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The organiser slug this member last picked in /dash, if any. */
export async function chosenOrganiser(): Promise<string | undefined> {
  const value = (await cookies()).get(ORGANISER_COOKIE)?.value;
  return value && SLUG.test(value) ? value : undefined;
}

export async function rememberOrganiser(slug: string): Promise<void> {
  if (!SLUG.test(slug)) {
    return;
  }
  (await cookies()).set(ORGANISER_COOKIE, slug, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}
