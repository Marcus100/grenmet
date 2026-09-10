import type { CapProfilePublic } from "@barrelsgd/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/cap/profile-editor";
import { getAuthApiPrefix, getCapApiBaseUrl } from "@/lib/auth-config";
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
  } catch {
    redirect("/signin");
  }
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/cap/hazard-profiles`, getCapApiBaseUrl()),
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok)
    throw new Error(`Failed to load hazard profiles (${response.status})`);
  const versions = (await response.json()) as CapProfilePublic[];
  return (
    <div className="space-y-6">
      <Link href="/cap">Back to CAP</Link>
      <h1 className="font-semibold text-2xl">Hazard profiles</h1>
      <ProfileEditor initialVersions={versions} />
    </div>
  );
}
