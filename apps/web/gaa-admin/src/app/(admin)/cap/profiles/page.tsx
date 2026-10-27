import type {
  CapProfilePublic,
  UserProfilePublic,
} from "@barrelsgd/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/cap/profile-editor";
import { PageHeader } from "@/components/layout/page-header";
import { getAuthApiPrefix, getCapApiBaseUrl } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function HazardProfilesPage() {
  const session = await readSessionCookie();
  if (!session) redirect("/signin");
  let token: string;
  try {
    token = (await exchangeSessionForAccessToken(session)).access_token;
  } catch (error) {
    reportError(error, "session");
    redirect("/signin");
  }
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/cap/hazard-profiles`, getCapApiBaseUrl()),
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok)
    throw new Error(`Failed to load hazard profiles (${response.status})`);
  const versions = (await response.json()) as CapProfilePublic[];
  const canManageLibrary = await canManageHazardLibrary(token);
  return (
    <div className="space-y-6">
      <Link href="/cap">Back to CAP</Link>
      <PageHeader title="Hazard profiles" />
      <ProfileEditor
        canManageLibrary={canManageLibrary}
        initialVersions={versions}
      />
    </div>
  );
}

/** Editing the impact matrix needs cap.library.manage; without it the section stays out. */
async function canManageHazardLibrary(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      new URL(`${getAuthApiPrefix()}/hr/profile/me`, getCapApiBaseUrl()),
      { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return false;
    const profile = (await response.json()) as UserProfilePublic;
    return profile.permissions?.includes("cap.library.manage") ?? false;
  } catch (error) {
    reportError(error, "cap");
    return false;
  }
}
