import type { Metadata, Route } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import {
  AllOrganisationsLink,
  NotGrantedOrganisation,
  OrganisationPage,
} from "@/components/organisation-page";
import { StaffList } from "@/components/staff-list";
import { loadOrganisationStaff } from "@/lib/hr-staff";
import { resolveOrganisationAccess } from "@/lib/organisation-access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Staff",
};

export const dynamic = "force-dynamic";

interface OrganisationStaffProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * The staff list for one organisation, at `/<orgSlug>/staff`. The slug must be
 * in the person's own list first; the API then decides whether they may see
 * the staff of that organisation (HR administrators only).
 */
export default async function OrganisationStaffPage({
  params,
}: OrganisationStaffProps) {
  const { orgSlug } = await params;
  const session = await requireSession(`/${orgSlug}/staff`);
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
  const load = await loadOrganisationStaff(
    session.accessToken,
    organisation.id
  );

  if (!load.ok && load.reason === "not-found") {
    return (
      <OrganisationPage>
        <NotGrantedOrganisation count={organisations.length} />
      </OrganisationPage>
    );
  }

  return (
    <OrganisationPage>
      <AllOrganisationsLink count={organisations.length} />
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">
          <Link
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            href={`/${organisation.slug}` as Route}
          >
            {organisation.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
      </header>
      <section aria-labelledby="staff-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="staff-heading">
          Staff list
        </h2>
        <StaffListBody load={load} />
      </section>
      <p className="text-muted-foreground text-sm">
        Staff onboarding and changes are still made in the GAA staff portal
        until HR screens move into Barrels HR.
      </p>
    </OrganisationPage>
  );
}

function StaffListBody({
  load,
}: {
  load: Awaited<ReturnType<typeof loadOrganisationStaff>>;
}) {
  if (!load.ok) {
    if (load.reason === "not-admin") {
      return (
        <p className="text-muted-foreground">
          The staff list is for HR administrators of this organisation. If you
          need to see it, ask your organisation&apos;s HR administrator.
        </p>
      );
    }
    return (
      <p className="text-muted-foreground" role="alert">
        We could not load the staff list just now. Refresh the page to try
        again.
      </p>
    );
  }

  if (load.staff.length === 0) {
    return (
      <p className="text-muted-foreground">
        No staff records for this organisation yet.
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground text-sm">
        {load.staff.length === 1
          ? "1 staff record"
          : `${load.staff.length} staff records`}
      </p>
      <StaffList staff={load.staff} />
    </>
  );
}
