import "server-only";

import type { BookingMyOrganisation } from "@barrelsgd/api-client";
import { notFound, redirect } from "next/navigation";
import { reportError } from "@/lib/report-error";
import type { StudioSession } from "@/lib/session";
import { findOrganisation } from "@/lib/studio-api";
import { type StudioFailure, studioFailure } from "@/lib/studio-errors";

/**
 * Runs a studio read for a page. An ended session goes to sign-in and keeps
 * the page; any other API failure is reported once and handed back as a
 * message with a next step. Non-API errors throw to `error.tsx`.
 */
export async function guarded<T>(
  read: () => Promise<T>,
  returnTo: string
): Promise<{ ok: true; value: T } | { ok: false; failure: StudioFailure }> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    const failure = studioFailure(error);
    if (failure.kind === "signed_out") {
      redirect(`/signin?${new URLSearchParams({ returnTo })}`);
    }
    reportError(error, "studio");
    return { ok: false, failure };
  }
}

/**
 * The organisation behind the URL slug, from the person's own list; an
 * unknown slug is a 404 (never reveal whether another business exists).
 */
export async function loadOrganisation(
  session: StudioSession,
  slug: string,
  returnTo: string
): Promise<
  | { ok: true; value: BookingMyOrganisation }
  | { ok: false; failure: StudioFailure }
> {
  const result = await guarded(
    () => findOrganisation(session.accessToken, slug),
    returnTo
  );
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    notFound();
  }
  return { ok: true, value: result.value };
}
