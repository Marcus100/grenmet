import type { StaffSetup } from "@barrelsgd/api-client";
import type { Route } from "next";
import Link from "next/link";
import { StaffFact, StaffStatusBadge } from "@/components/staff-status";

/**
 * Read-only staff list for an HR administrator. Each row names the person, links
 * to their record at `/<orgSlug>/staff/<userId>`, shows their status in words and
 * the readiness facts the onboarding screen shows.
 */
export function StaffList({
  orgSlug,
  staff,
}: {
  orgSlug: string;
  staff: StaffSetup[];
}) {
  return (
    <ul aria-label="Staff" className="divide-border divide-y rounded-lg border">
      {staff.map((member) => (
        <li className="flex flex-col gap-2 px-4 py-3" key={member.user_id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              href={`/${orgSlug}/staff/${member.user_id}` as Route}
            >
              {member.name}
            </Link>
            <StaffStatusBadge status={member.status} />
          </div>
          <p className="text-muted-foreground text-sm break-all">
            {member.email}
          </p>
          <dl className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <StaffFact
              label="Account"
              value={member.account_active ? "enabled" : "disabled"}
            />
            <StaffFact
              label="Email"
              value={
                member.email_verified ? "verified" : "verification pending"
              }
            />
            <StaffFact
              label="Staff access"
              value={
                member.registration_pending ? "approval needed" : "approved"
              }
            />
            <StaffFact
              label="HR details"
              value={member.employment_ready ? "ready" : "incomplete"}
            />
            <StaffFact
              label="Employee number"
              value={member.employee_number ?? "not set"}
            />
          </dl>
        </li>
      ))}
    </ul>
  );
}
