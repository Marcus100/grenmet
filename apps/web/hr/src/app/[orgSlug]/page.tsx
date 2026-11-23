import type { Metadata, Route } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import {
  AllOrganisationsLink,
  NotGrantedOrganisation,
  OrganisationPage,
} from "@/components/organisation-page";
import { resolveOrganisationAccess } from "@/lib/organisation-access";
import { scopeLabel } from "@/lib/organisation-scope";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Organisation",
};

export const dynamic = "force-dynamic";

interface OrganisationHomeProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * One organisation's HR home at `/<orgSlug>`. The slug is only honoured when it
 * is in this person's own list; anything else gets "no access to this
 * organisation", with the same wording whether or not the organisation exists.
 */
export default async function OrganisationHomePage({
  params,
}: OrganisationHomeProps) {
  const { orgSlug } = await params;
  const session = await requireSession(`/${orgSlug}`);
  const access = await resolveOrganisationAccess(session.accessToken, orgSlug);

  if (access.state === "unavailable") {
    return (
      <OrganisationPage>
        <p className="text-muted-foreground" role="alert">
          We could not load this organisation just now. Refresh the page to try
          again.
        </p>
      </OrganisationPage>
    );
  }

  if (access.state === "no-access") {
    return (
      <OrganisationPage>
        <NoAccess />
      </OrganisationPage>
    );
  }

  if (access.state === "not-granted") {
    return (
      <OrganisationPage>
        <NotGrantedOrganisation count={access.organisations.length} />
      </OrganisationPage>
    );
  }

  const { organisation, organisations } = access;

  return (
    <OrganisationPage>
      <AllOrganisationsLink count={organisations.length} />
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">Barrels HR</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {organisation.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Your access: {scopeLabel(organisation.scope)}
        </p>
      </header>
      <section aria-labelledby="staff-link-heading" className="space-y-2">
        <h2 className="text-lg font-semibold" id="staff-link-heading">
          Staff
        </h2>
        <Link
          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
          href={`/${organisation.slug}/staff` as Route}
        >
          View the staff list
        </Link>
      </section>
      <section aria-labelledby="modules-heading" className="space-y-2">
        <h2 className="text-lg font-semibold" id="modules-heading">
          HR work
        </h2>
        <p className="text-muted-foreground">
          HR screens move into Barrels HR in later releases. Until then, HR work
          stays in the GAA staff portal.
        </p>
      </section>
    </OrganisationPage>
  );
}
