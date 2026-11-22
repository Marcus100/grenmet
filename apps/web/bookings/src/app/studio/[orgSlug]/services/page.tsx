import { notFound, redirect } from "next/navigation";

/** The same business slug shape the studio actions accept (lowercase letters, digits, inner hyphens). */
const ORG_SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/**
 * `/studio/<business>/services` was a guessed address. Services live in
 * Settings, under "Services and deposits"; the fragment opens that section.
 */
export default async function ServicesRedirectPage({
  params,
}: Readonly<{ params: Promise<{ orgSlug: string }> }>) {
  const { orgSlug } = await params;
  if (!ORG_SEGMENT.test(orgSlug)) {
    notFound();
  }
  redirect(`/studio/${orgSlug}/settings#services-heading`);
}
