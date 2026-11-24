import type { GradeSetup, StaffSetup } from "@barrelsgd/api-client";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import {
  AllOrganisationsLink,
  NotGrantedOrganisation,
  OrganisationPage,
} from "@/components/organisation-page";
import { StaffFact, StaffStatusBadge } from "@/components/staff-status";
import {
  type GradesLoad,
  loadOrganisationGrades,
  loadOrganisationStaff,
  type StaffLoad,
} from "@/lib/hr-staff";
import {
  employmentTypeLabel,
  formatRecordDate,
  NOT_SET,
} from "@/lib/my-record-format";
import { resolveOrganisationAccess } from "@/lib/organisation-access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Staff record",
};

export const dynamic = "force-dynamic";

interface StaffRecordProps {
  params: Promise<{ orgSlug: string; userId: string }>;
}

/**
 * One staff record for HR administrators, at `/<orgSlug>/staff/<userId>`. The
 * slug is checked against the person's own organisation list first. The record
 * is taken from the organisation's staff list, which the API only returns to
 * people with `hr.setup.manage` in that organisation, so a foreign id cannot be
 * found here. Read-only.
 */
export default async function StaffRecordPage({ params }: StaffRecordProps) {
  const { orgSlug, userId } = await params;
  const session = await requireSession(`/${orgSlug}/staff/${userId}`);
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

  const member = load.ok
    ? load.staff.find((candidate) => candidate.user_id === userId)
    : undefined;
  const grades =
    member === undefined
      ? undefined
      : await loadOrganisationGrades(session.accessToken, organisation.id);

  return (
    <OrganisationPage>
      <AllOrganisationsLink count={organisations.length} />
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">
          <Link
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            href={`/${organisation.slug}/staff` as Route}
          >
            {organisation.name} staff
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {member ? member.name : "Staff record"}
        </h1>
      </header>
      <StaffRecordState
        grades={grades}
        load={load}
        member={member}
        orgSlug={organisation.slug}
        staff={load.ok ? load.staff : []}
      />
    </OrganisationPage>
  );
}

function StaffRecordState({
  load,
  member,
  grades,
  orgSlug,
  staff,
}: {
  load: StaffLoad;
  member: StaffSetup | undefined;
  /** Read only once the person is found on the list; undefined otherwise. */
  grades: GradesLoad | undefined;
  orgSlug: string;
  staff: StaffSetup[];
}) {
  if (!load.ok) {
    if (load.reason === "not-admin") {
      return (
        <p className="text-muted-foreground">
          Staff records are for HR administrators of this organisation. If you
          need to see one, ask your organisation&apos;s HR administrator.
        </p>
      );
    }
    return (
      <p className="text-muted-foreground" role="alert">
        We could not load this staff record just now. Refresh the page to try
        again.
      </p>
    );
  }

  if (!member) {
    return (
      <section aria-labelledby="missing-heading" className="space-y-2">
        <h2 className="text-lg font-semibold" id="missing-heading">
          No staff record found
        </h2>
        <p className="text-muted-foreground">
          This link does not match a staff record in this organisation.
        </p>
        <Link
          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
          href={`/${orgSlug}/staff` as Route}
        >
          Back to the staff list
        </Link>
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="access-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="access-heading">
          Account and access
        </h2>
        <StaffStatusBadge status={member.status} />
        <p className="text-muted-foreground text-sm break-all">
          {member.email}
        </p>
        <dl className="flex flex-col gap-2 rounded-lg border p-4">
          <StaffFact
            label="Account"
            value={member.account_active ? "enabled" : "disabled"}
          />
          <StaffFact
            label="Email"
            value={member.email_verified ? "verified" : "verification pending"}
          />
          <StaffFact
            label="Staff access"
            value={member.registration_pending ? "approval needed" : "approved"}
          />
          <StaffFact
            label="HR details"
            value={member.employment_ready ? "ready" : "incomplete"}
          />
        </dl>
      </section>
      <section aria-labelledby="employment-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="employment-heading">
          Employment and service
        </h2>
        <dl className="flex flex-col gap-2 rounded-lg border p-4">
          <StaffFact label="Staff number" value={member.number || NOT_SET} />
          <StaffFact
            label="Employee number"
            value={member.employee_number ?? NOT_SET}
          />
          <StaffFact
            label="Grade"
            value={gradeValue(member.grade_id, grades)}
          />
          <StaffFact
            label="Employment type"
            value={employmentTypeLabel(member.employment_type)}
          />
          <StaffFact label="Start date" value={dateValue(member.start_date)} />
          <StaffFact
            label="Continuous service date"
            value={dateValue(member.continuous_service_date)}
          />
          <StaffFact
            label="Probation end date"
            value={dateValue(member.probation_end_date)}
          />
          <StaffFact
            label="Probation completed"
            value={dateValue(member.probation_completed_date)}
          />
          <StaffFact
            label="Supervisor"
            value={supervisorValue(member.supervisor_id, staff)}
          />
          <StaffFact
            label="Service details source"
            value={member.service_details_source ?? NOT_SET}
          />
        </dl>
        <p className="text-muted-foreground text-sm">
          This record is read-only. Changes are still made in the GAA staff
          portal until HR screens move into Barrels HR.
        </p>
      </section>
    </>
  );
}

function dateValue(value: string | null | undefined): string {
  return value ? formatRecordDate(value) : NOT_SET;
}

/** The grade name, or a calm message when the grade list could not be read or does not hold this grade. */
function gradeValue(gradeId: string, grades: GradesLoad | undefined): string {
  if (!gradeId) {
    return NOT_SET;
  }
  if (!grades) {
    return "could not load just now";
  }
  if (!grades.ok) {
    return "could not load just now";
  }
  const grade: GradeSetup | undefined = grades.grades.find(
    (candidate) => candidate.id === gradeId
  );
  return grade ? grade.label : "not recognised";
}

/** The supervisor's name when they are on this organisation's staff list; otherwise a calm note that they are set. */
function supervisorValue(
  supervisorId: string | null | undefined,
  staff: StaffSetup[]
): string {
  if (!supervisorId) {
    return NOT_SET;
  }
  const supervisor = staff.find(
    (candidate) => candidate.user_id === supervisorId
  );
  return supervisor ? supervisor.name : "set (not on this staff list)";
}
