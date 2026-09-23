import "server-only";
import { redirect } from "next/navigation";
import {
  exchangeSessionForAccessToken,
  isAuthApiError,
  readSessionCookie,
  type SessionAccessTokenResponse,
} from "@/lib/session";

/**
 * Session for an account page. Signed-out visitors go to sign-in; an expired
 * session says so there instead of rendering a half-empty page.
 */
export async function requireAccount(): Promise<SessionAccessTokenResponse> {
  const token = await readSessionCookie();
  if (!token) redirect("/");
  try {
    return await exchangeSessionForAccessToken(token);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      redirect("/?session=expired");
    }
    throw error;
  }
}
