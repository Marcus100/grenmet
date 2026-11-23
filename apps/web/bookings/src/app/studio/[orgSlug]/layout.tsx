import { StudioNav } from "@/components/studio/studio-nav";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { findOrganisation } from "@/lib/studio-api";
import { canManageBookings } from "@/lib/studio-view";

/** Role decides the admin-only nav links (New booking, Plan & billing); every page and the API check it again. */
async function canCreateBookings(orgSlug: string): Promise<boolean> {
  try {
    const session = await getSession();
    if (!session) {
      return false;
    }
    const org = await findOrganisation(session.accessToken, orgSlug);
    return org ? canManageBookings(org.role) : false;
  } catch (error) {
    reportError(error, "studio");
    return false;
  }
}

export default async function OrganisationLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}>) {
  const { orgSlug } = await params;
  const canManage = await canCreateBookings(orgSlug);
  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[12rem_1fr] md:items-start">
      <StudioNav canCreate={canManage} canPlan={canManage} orgSlug={orgSlug} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
