import {
  StudioPlainFrame,
  StudioShell,
} from "@/components/studio/studio-shell";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { findOrganisation, getBusinessProfile } from "@/lib/studio-api";
import { loadPendingRequests } from "@/lib/studio-pending";
import { canManageBookings, DEFAULT_TIMEZONE } from "@/lib/studio-view";

interface ShellData {
  canManage: boolean;
  name: string | null;
  pendingCount: number | null;
  publicSlug: string | null;
}

/**
 * What the shell shows: the business name, its public page, the role (which
 * decides the admin-only links; every page and the API check it again) and the
 * count of bookings waiting to be confirmed. Each read that fails leaves its
 * piece out and is reported; the pages answer their own failures.
 */
async function loadShellData(
  accessToken: string,
  orgSlug: string
): Promise<ShellData> {
  const data: ShellData = {
    canManage: false,
    name: null,
    pendingCount: null,
    publicSlug: null,
  };
  try {
    const org = await findOrganisation(accessToken, orgSlug);
    if (!org) {
      return data;
    }
    data.name = org.name;
    data.canManage = canManageBookings(org.role);
    const profile = await getBusinessProfile(accessToken, org.id);
    data.publicSlug = profile.publicSlug ?? null;
    const pending = await loadPendingRequests(
      accessToken,
      org.id,
      profile.timezone || DEFAULT_TIMEZONE
    );
    data.pendingCount = pending.total;
  } catch (error) {
    reportError(error, "studio");
  }
  return data;
}

export default async function OrganisationLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}>) {
  const { orgSlug } = await params;
  const session = await getSession();
  if (!session) {
    return <StudioPlainFrame>{children}</StudioPlainFrame>;
  }
  const data = await loadShellData(session.accessToken, orgSlug);
  return (
    <StudioShell
      canCreate={data.canManage}
      canPlan={data.canManage}
      name={data.name ?? "Barrels Bookings Studio"}
      orgSlug={orgSlug}
      pendingCount={data.pendingCount}
      publicHref={data.publicSlug ? `/${data.publicSlug}` : null}
      userName={session.name}
    >
      {children}
    </StudioShell>
  );
}
