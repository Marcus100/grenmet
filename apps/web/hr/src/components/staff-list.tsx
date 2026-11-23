import type { StaffSetup } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";

/**
 * Status words for the staff status the API returns. The tone is a text badge,
 * so the state is never carried by colour alone.
 */
const STATUS: Record<
  string,
  {
    label: string;
    variant: "solid-success" | "solid-warning" | "solid-light";
  }
> = {
  active: { label: "Active", variant: "solid-success" },
  pending: { label: "Pending", variant: "solid-warning" },
  inactive: { label: "Inactive", variant: "solid-light" },
};

const UNKNOWN_STATUS = {
  label: "Status not recognised",
  variant: "solid-light",
} as const;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Read-only staff list for an HR administrator. Each row names the person, their
 * status in words and the four readiness facts the onboarding screen shows.
 */
export function StaffList({ staff }: { staff: StaffSetup[] }) {
  return (
    <ul aria-label="Staff" className="divide-border divide-y rounded-lg border">
      {staff.map((member) => {
        const status = STATUS[member.status] ?? UNKNOWN_STATUS;
        return (
          <li className="flex flex-col gap-2 px-4 py-3" key={member.user_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{member.name}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-muted-foreground text-sm break-all">
              {member.email}
            </p>
            <dl className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
              <Fact
                label="Account"
                value={member.account_active ? "enabled" : "disabled"}
              />
              <Fact
                label="Email"
                value={
                  member.email_verified ? "verified" : "verification pending"
                }
              />
              <Fact
                label="Staff access"
                value={
                  member.registration_pending ? "approval needed" : "approved"
                }
              />
              <Fact
                label="HR details"
                value={member.employment_ready ? "ready" : "incomplete"}
              />
              <Fact
                label="Employee number"
                value={member.employee_number ?? "not set"}
              />
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
