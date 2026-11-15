import { notFound, redirect } from "next/navigation";

/** What a business slug can contain in an address (letters, digits, hyphens). */
const ORG_SEGMENT = /^[A-Za-z0-9._~-]+$/u;

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
