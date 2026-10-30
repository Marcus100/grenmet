import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StudioAlert } from "@/components/studio/studio-alert";
import { requireSession } from "@/lib/session";
import { listMyOrganisations } from "@/lib/studio-api";
import { guarded } from "@/lib/studio-page";

export const metadata: Metadata = {
  title: "Your businesses",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Organisation picker. One business goes straight to its agenda; none explains
 * how to get access. The id comes from the person's own list, never the URL.
 */
export default async function StudioPage() {
  const session = await requireSession("/studio");
  const result = await guarded(
    () => listMyOrganisations(session.accessToken),
    "/studio"
  );

  if (!result.ok) {
    return <StudioAlert failure={result.failure} />;
  }
  const organisations = result.value;

  if (organisations.length === 1 && organisations[0]) {
    redirect(`/studio/${organisations[0].slug}/agenda`);
  }

  if (organisations.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>You are not part of a business yet</EmptyTitle>
          <EmptyDescription>
            {session.name} is signed in, but no business has added this account.
            Ask the business owner to invite {session.email} to their Barrels
            organisation, then refresh this page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            href="/"
          >
            See how Barrels Bookings works
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Choose a business</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {organisations.map((organisation) => (
          <li key={organisation.id}>
            <Link
              className="border-border hover:bg-muted flex min-h-11 flex-col gap-1 rounded-lg border p-4"
              href={{ pathname: `/studio/${organisation.slug}/agenda` }}
            >
              <span className="font-semibold">{organisation.name}</span>
              <span className="text-muted-foreground text-sm">
                {ROLE_LABEL[organisation.role] ?? organisation.role}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
