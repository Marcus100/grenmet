"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startRedemption } from "@/lib/account-rewards";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hold a card's stamps behind a one-time code for staff to confirm. Outcomes
 * become fixed notice codes, so no message is reflected from a URL.
 */
export async function redeemCard(formData: FormData): Promise<never> {
  const programId = String(formData.get("program_id") ?? "");
  const session = await readSessionCookie();
  if (!session) redirect("/");
  if (!UUID.test(programId)) redirect("/rewards?notice=failed");

  let notice: "redeeming" | "not-ready" | "failed";
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(session);
    await startRedemption(accessToken, programId);
    notice = "redeeming";
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 401) redirect("/?session=expired");
    notice = status === 409 ? "not-ready" : "failed";
  }
  revalidatePath("/rewards");
  redirect(`/rewards?notice=${notice}`);
}
