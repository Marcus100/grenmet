import type { Metadata, Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NoAccess } from "@/components/no-access";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import { scopeLabel } from "@/lib/organisation-scope";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Organisation",
};

export const dynamic = "force-dynamic";

interface OrganisationHomeProps {
  params: Promise<{ orgSlug: string }>;
}

const PAGE_CLASS = "mx-auto flex w-full max-w-3xl flex-col gap-8 p-6";

function Page({ children }: { children: ReactNode }) {
  return (
    <main className={PAGE_CLASS} id="main-content">
      {children}
    </main>
  );
}

function AllOrganisationsLink({ count }: { count: number }) {
  return (
    <nav aria-label="Organisations" className="text-sm">
      <Link
        className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        href={"/" as Route}
      >
        {count > 1 ? "All organisations" : "Your organisations"}
      </Link>
    </nav>
  );
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
  const load = await loadMyOrganisations(session.accessToken);

  if (!load.ok) {
    return (
      <Page>
        <p className="text-muted-foreground" role="alert">
          We could not load this organisation just now. Refresh the page to try
          again.
        </p>
      </Page>
    );
  }

  if (load.organisations.length === 0) {
    return (
      <Page>
        <NoAccess />
      </Page>
    );
  }

  const organisation = load.organisations.find(
    (candidate) => candidate.slug === orgSlug
  );

  if (!organisation) {
    return (
      <Page>
        <AllOrganisationsLink count={load.organisations.length} />
        <section aria-labelledby="no-org-heading" className="space-y-2">
          <h1
            className="text-2xl font-semibold tracking-tight"
            id="no-org-heading"
          >
            No access to this organisation
          </h1>
          <p className="text-muted-foreground">
            Your Barrels HR access does not include this organisation. Choose
            one of your organisations instead.
          </p>
        </section>
      </Page>
    );
  }

  return (
    <Page>
      <AllOrganisationsLink count={load.organisations.length} />
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">Barrels HR</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {organisation.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Your access: {scopeLabel(organisation.scope)}
        </p>
      </header>
      <section aria-labelledby="modules-heading" className="space-y-2">
        <h2 className="text-lg font-semibold" id="modules-heading">
          HR work
        </h2>
        <p className="text-muted-foreground">
          HR screens move into Barrels HR in later releases. Until then, HR work
          stays in the GAA staff portal.
        </p>
      </section>
    </Page>
  );
}
