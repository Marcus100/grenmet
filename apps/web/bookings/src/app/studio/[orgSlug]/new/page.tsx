import { notFound, redirect } from "next/navigation";

/** The same business slug shape the studio actions accept (lowercase letters, digits, inner hyphens). */
const ORG_SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/**
 * `/studio/<business>/new` was a guessed address for New booking. The page
 * lives at `bookings/new`; the redirect keeps old links working.
 */
export default async function NewBookingRedirectPage({
  params,
}: Readonly<{ params: Promise<{ orgSlug: string }> }>) {
  const { orgSlug } = await params;
  if (!ORG_SEGMENT.test(orgSlug)) {
    notFound();
  }
  redirect(`/studio/${orgSlug}/bookings/new`);
}
