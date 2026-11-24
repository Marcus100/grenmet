import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StudioAlert } from "@/components/studio/studio-alert";
import { StudioPlainFrame } from "@/components/studio/studio-shell";
import {
  CARD,
  CARD_LINK,
  StudioPageHeader,
} from "@/components/studio/studio-ui";
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
    return (
      <StudioPlainFrame userName={session.name}>
        <StudioAlert failure={result.failure} />
      </StudioPlainFrame>
    );
  }
  const organisations = result.value;

  if (organisations.length === 1 && organisations[0]) {
    redirect(`/studio/${organisations[0].slug}/agenda`);
  }

  if (organisations.length === 0) {
    return (
      <StudioPlainFrame userName={session.name}>
        <section className={`${CARD} space-y-3`}>
          <h1 className="text-foreground text-2xl font-bold">
            You are not part of a business yet
          </h1>
          <p className="text-foreground/80">
            {session.name} is signed in, but no business has added this account.
            Ask the business owner to invite <span>{session.email}</span> to
            their Barrels organisation, then refresh this page.
          </p>
          <Link className={CARD_LINK} href="/">
            See how Barrels Bookings works
          </Link>
        </section>
      </StudioPlainFrame>
    );
  }

  return (
    <StudioPlainFrame userName={session.name}>
      <div className="space-y-6">
        <StudioPageHeader title="Choose a business" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {organisations.map((organisation) => (
            <li key={organisation.id}>
              <Link
                className={`${CARD} hover:bg-muted active:bg-muted focus-visible:outline-ring flex min-h-14 flex-col gap-1 transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2`}
                href={{ pathname: `/studio/${organisation.slug}/agenda` }}
              >
                <span className="text-foreground font-semibold">
                  {organisation.name}
                </span>
                <span className="text-foreground/80 text-sm">
                  {ROLE_LABEL[organisation.role] ?? organisation.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </StudioPlainFrame>
  );
}
