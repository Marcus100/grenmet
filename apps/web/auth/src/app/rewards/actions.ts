"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCheckIn, startRedemption } from "@/lib/account-rewards";
import { reportError } from "@/lib/report-error";
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

type CheckInNotice =
  | "checked-in"
  | "already-checked-in"
  | "invalid-code"
  | "unavailable"
  | "check-in-failed";

/**
 * Post a venue code. Every outcome becomes a fixed notice code: a bad or
 * expired code is one generic message so the page is no oracle for codes.
 */
export async function checkIn(formData: FormData): Promise<never> {
  const token = String(formData.get("token") ?? "").trim();
  const session = await readSessionCookie();
  if (!session) redirect("/");
  // Mirrors the API bound (10 to 200 characters) without a round trip.
  if (token.length < 10 || token.length > 200) {
    redirect("/rewards?notice=invalid-code#check-in");
  }

  let notice: CheckInNotice;
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(session);
    await createCheckIn(accessToken, token);
    notice = "checked-in";
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 401) redirect("/?session=expired");
    if (status === 409) notice = "already-checked-in";
    else if (status === 400 || status === 404 || status === 422)
      notice = "invalid-code";
    else if (status === 503) notice = "unavailable";
    else {
      reportError(error, "rewards-check-in");
      notice = "check-in-failed";
    }
  }
  revalidatePath("/rewards");
  redirect(`/rewards?notice=${notice}#check-in`);
}
