"use server";
import { confirmActivation } from "@/lib/modern-auth";
import { reportError } from "@/lib/report-error";
import { isAuthApiError } from "@/lib/session";

export async function activateAccount(
  _state: { message: string; done: boolean },
  form: FormData
) {
  if (form.get("password") !== form.get("confirm"))
    return { message: "Passwords must match.", done: false };
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (!token || password.length < 12 || password.length > 128)
    return {
      message: "Use your activation link and a password of 12–128 characters.",
      done: false,
    };
  try {
    const result = await confirmActivation({ token, new_password: password });
    return { message: result.message, done: true };
  } catch (error) {
    reportError(error, "auth-activation");
    return {
      message: isAuthApiError(error)
        ? error.detail
        : "Unable to activate your account. Try again or contact your administrator.",
      done: false,
    };
  }
}
