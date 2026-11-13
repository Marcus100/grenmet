"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { joinAccountApp, leaveAccountApp } from "@/lib/account-apps";
import { isAuthApiError, readSessionCookie } from "@/lib/session";

const APP_KEY = /^[a-z][a-z0-9-]{1,30}$/u;

/** Fixed codes the page maps to text, so no message is reflected from a URL. */
type Notice = "joined" | "requested" | "left" | "left-still" | "failed";

async function change(
  formData: FormData,
  run: (app: string, token: string) => Promise<Notice>
): Promise<never> {
  const app = String(formData.get("app") ?? "");
  const token = await readSessionCookie();
  if (!(token && APP_KEY.test(app))) redirect("/");
  let notice: Notice;
  try {
    notice = await run(app, token);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/?session=expired");
    notice = "failed";
  }
  revalidatePath("/apps");
  redirect(`/apps?notice=${notice}`);
}

export async function joinAppFromAccount(formData: FormData): Promise<never> {
  return await change(formData, async (app, token) => {
    const result = await joinAccountApp(app, token);
    return result.pending ? "requested" : "joined";
  });
}

export async function leaveAppFromAccount(formData: FormData): Promise<never> {
  return await change(formData, async (app, token) => {
    const result = await leaveAccountApp(app, token);
    return result.still_has_access ? "left-still" : "left";
  });
}
