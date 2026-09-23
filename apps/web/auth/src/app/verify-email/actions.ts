"use server";
import { emailConfirm, emailRequest } from "@/lib/modern-auth";
import { reportError } from "@/lib/report-error";
import { isAuthApiError } from "@/lib/session";
export async function verifyEmail(
  _state: { message: string; done: boolean },
  form: FormData
) {
  const token = String(form.get("token") ?? "");
  try {
    if (token && form.get("password") !== form.get("confirm"))
      return { message: "Passwords must match.", done: false };
    const result = token
      ? await emailConfirm({
          token,
          new_password: String(form.get("password") ?? ""),
        })
      : await emailRequest({ email: String(form.get("email") ?? "") });
    return { message: result.message, done: true };
  } catch (error) {
    reportError(error, "auth-verify-email");
    return {
      message: isAuthApiError(error)
        ? error.detail
        : "Unable to complete email verification.",
      done: false,
    };
  }
}
