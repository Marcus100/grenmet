import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JanitorHeader } from "@/components/janitorial/portal";
import { StaffManager } from "@/components/janitorial/staff-manager";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
  getJanitorialGrants,
  getJanitorialStaff,
} from "@/db/janitorial/queries";

export const metadata: Metadata = {
  title: "Janitorial staff",
  description:
    "Cleaning contractor, contract cleaners and supervisor building access.",
};

export const dynamic = "force-dynamic";

export default async function JanitorStaffPage() {
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const [people, grants, catalogue] = await Promise.all([
    getJanitorialStaff(),
    access.canManageScope ? getJanitorialGrants() : Promise.resolve(null),
    access.canManageScope ? getJanitorialCatalogue() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <JanitorHeader
        crumbs={[{ href: "/janitor", label: "Janitorial" }]}
        title="Staff"
      >
        The cleaning contractor&apos;s people and which buildings GAA
        supervisors oversee.
      </JanitorHeader>
      <StaffManager
        buildings={catalogue?.buildings ?? []}
        canManageScope={access.canManageScope}
        canManageStaff={access.canManageStaff}
        contractors={people.contractors}
        grants={grants}
        staff={people.staff}
      />
    </div>
  );
}
