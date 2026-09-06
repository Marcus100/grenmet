"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleFinish } from "@/lib/modern-auth";
import { isAuthApiError, writeSessionCookie } from "@/lib/session";

export async function completeGoogle(
  _state: string,
  form: FormData
): Promise<string> {
  const jar = await cookies();
  const challenge = jar.get("google_challenge")?.value;
  if (!challenge) return "Sign-in expired. Start Google sign-in again.";
  try {
    const result = await googleFinish({
      challenge,
      totp_code: String(form.get("totp_code") ?? ""),
    });
    jar.delete("google_challenge");
    await writeSessionCookie(result.session_token, result.session_expires_at);
  } catch (error) {
    return isAuthApiError(error)
      ? error.detail
      : "Sign-in failed. Start again.";
  }
  redirect("/");
}
