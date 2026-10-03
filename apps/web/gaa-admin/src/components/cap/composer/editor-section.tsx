import { redirect } from "next/navigation";
import { AlertBoard } from "@/components/cap/alert-board";
import type { CapAlertList } from "@/lib/cap-api";
import { fetchAdminAlerts } from "@/lib/cap-api";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

export async function EditorSection() {
  const alerts = await getAdminAlerts();
  return <AlertBoard alerts={alerts} />;
}

async function getAdminAlerts(): Promise<CapAlertList> {
  // The editor list hits the authenticated `/api/v1/cap/alerts`, so exchange the
  // session cookie for a Bearer access token (same handshake as the admin
  // layout). An expired/revoked session redirects to sign-in rather than
  // silently showing an empty dashboard.
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    redirect("/signin");
  }

  let accessToken: string;
  try {
    const session = await exchangeSessionForAccessToken(sessionToken);
    accessToken = session.access_token;
  } catch {
    redirect("/signin");
  }

  return fetchAdminAlerts(accessToken);
}
