import { notFound, redirect } from "next/navigation";

/** The same business slug shape the studio actions accept (lowercase letters, digits, inner hyphens). */
const ORG_SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/**
 * `/studio/<business>` has no page of its own: send it to the agenda, the
 * screen staff open first. The agenda checks that the business is one of the
 * person's own and answers not found otherwise, so nothing is revealed here.
 */
export default async function OrganisationIndexPage({
  params,
}: Readonly<{ params: Promise<{ orgSlug: string }> }>) {
  const { orgSlug } = await params;
  if (!ORG_SEGMENT.test(orgSlug)) {
    notFound();
  }
  redirect(`/studio/${orgSlug}/agenda`);
}
