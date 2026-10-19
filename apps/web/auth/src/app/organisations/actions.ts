"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acceptOrganisationInvitation,
  describeAcceptFailure,
} from "@/lib/account-organisations";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";

/** An emailed token is URL-safe base64: keep anything else out of the request. */
const TOKEN = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * Accept an invitation. The token arrives from the hidden form field and is
 * sent to the API in the request body. Outcomes become fixed notice codes, so
 * no message is reflected from a URL.
 */
export async function acceptInvitation(formData: FormData): Promise<never> {
  const token = String(formData.get("token") ?? "");
  const session = await readSessionCookie();
  if (!session) redirect("/");
  if (!TOKEN.test(token)) redirect("/organisations/accept?notice=invalid");

  let destination: "joined" | "invalid" | "wrong-email" | "failed";
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(session);
    await acceptOrganisationInvitation(accessToken, token);
    destination = "joined";
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 401) redirect("/?session=expired");
    destination = describeAcceptFailure(error);
  }

  if (destination === "joined") {
    revalidatePath("/organisations");
    redirect("/organisations?notice=joined");
  }
  redirect(`/organisations/accept?notice=${destination}`);
}
