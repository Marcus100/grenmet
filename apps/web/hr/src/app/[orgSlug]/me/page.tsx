import type { HrMeEmploymentPublic } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import {
  AllOrganisationsLink,
  NotGrantedOrganisation,
  OrganisationPage,
} from "@/components/organisation-page";
import { type EmploymentLoad, loadMyEmployment } from "@/lib/hr-me-employment";
import {
  codeLabel,
  EMPLOYMENT_STATUS,
  employmentTypeLabel,
  formatRecordDate,
  leaveBalanceWords,
  NOT_SET,
} from "@/lib/my-record-format";
import { resolveOrganisationAccess } from "@/lib/organisation-access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "My record",
};

export const dynamic = "force-dynamic";

interface MyRecordProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * The signed-in person's own record in one organisation, at `/<orgSlug>/me`.
 * The slug is checked against their own organisation list before anything is
 * read, and the API id is taken from that validated membership.
 */
export default async function MyRecordPage({ params }: MyRecordProps) {
  const { orgSlug } = await params;
  const session = await requireSession(`/${orgSlug}/me`);
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
  const load = await loadMyEmployment(session.accessToken, organisation.id);

  if (!load.ok && load.reason === "not-granted") {
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
          {organisation.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My record</h1>
      </header>
      <RecordState load={load} />
    </OrganisationPage>
  );
}

/** The record, the calm no-record wording, or the alert. Never an empty record for a failed read. */
function RecordState({ load }: { load: EmploymentLoad }) {
  if (load.ok) {
    return <RecordBody employment={load.employment} />;
  }
  if (load.reason === "not-employed") {
    return (
      <section aria-labelledby="no-record-heading" className="space-y-2">
        <h2 className="text-lg font-semibold" id="no-record-heading">
          No current employment record
        </h2>
        <p className="text-muted-foreground">
          You have no current employment record in this organisation.
        </p>
      </section>
    );
  }
  return (
    <p className="text-muted-foreground" role="alert">
      We could not load your record just now. Refresh the page to try again.
    </p>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function RecordBody({ employment }: { employment: HrMeEmploymentPublic }) {
  const status = EMPLOYMENT_STATUS[employment.status] ?? {
    label: codeLabel(employment.status),
    variant: "solid-light" as const,
  };

  return (
    <>
      <section aria-labelledby="employment-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="employment-heading">
          Employment
        </h2>
        <Badge variant={status.variant}>{status.label}</Badge>
        <dl className="flex flex-col gap-2 rounded-lg border p-4">
          <Fact label="Position" value={employment.position || NOT_SET} />
          <Fact label="Department" value={employment.department_name} />
          <Fact
            label="Employment type"
            value={employmentTypeLabel(employment.employment_type)}
          />
          <Fact
            label="Start date"
            value={
              employment.start_date
                ? formatRecordDate(employment.start_date)
                : NOT_SET
            }
          />
          {employment.end_date ? (
            <Fact
              label="End date"
              value={formatRecordDate(employment.end_date)}
            />
          ) : null}
        </dl>
      </section>
      <section aria-labelledby="leave-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="leave-heading">
          Leave balances
        </h2>
        {employment.leave_balances.length === 0 ? (
          <p className="text-muted-foreground">No leave balances yet.</p>
        ) : (
          <ul
            aria-label="Leave balances"
            className="divide-border divide-y rounded-lg border"
          >
            {employment.leave_balances.map((balance) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                key={balance.leave_type}
              >
                <span className="font-medium">
                  {codeLabel(balance.leave_type)}
                </span>
                <span className="tabular-nums">
                  {leaveBalanceWords(balance.balance_days)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
