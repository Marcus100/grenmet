"use server";

import { redirect } from "next/navigation";
import { continuePath, parseHandoffRequest, startHandoff } from "@/lib/handoff";
import { readSessionCookie } from "@/lib/session";

/** "Join <app>": grant the app's default role, then continue into it. */
export async function joinApp(formData: FormData): Promise<void> {
  const request = parseHandoffRequest(
    String(formData.get("app") ?? ""),
    String(formData.get("state") ?? "")
  );
  if (!request) redirect("/");
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    redirect(
      `/?app=${request.app}&returnTo=${encodeURIComponent(continuePath(request))}`
    );
  }
  const result = await startHandoff(request, sessionToken, true);
  redirect(result.kind === "redirect" ? result.url : continuePath(request));
}
