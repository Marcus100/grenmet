import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { readQueryParam } from "@/lib/return-to";
import { readSessionCookie } from "@/lib/session";
import { acceptInvitation } from "../actions";

export const metadata: Metadata = {
  referrer: "no-referrer",
  title: "Accept invitation — Barrels account",
};
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  failed: "That didn't work. Try again, or ask the person who invited you.",
  invalid:
    "This invitation is invalid or has expired. Ask the person who invited you to send a new one.",
  "wrong-email":
    "This invitation was sent to a different email address. Sign in with the address it was sent to.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The emailed link lands here with `?token=`. Reading the page never accepts:
 * the signed-in person confirms, and the token travels in the POST body.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const token = readQueryParam(params.token);
  const notice = NOTICES[readQueryParam(params.notice) ?? ""];

  if (!(await readSessionCookie())) {
    // Sign in first, then come back to this exact link.
    const back = token
      ? `/organisations/accept?${new URLSearchParams({ token })}`
      : "/organisations";
    redirect(`/?${new URLSearchParams({ returnTo: back })}` as Route);
  }

  return (
    <AuthShell greeting="Barrels account" subtitle="One account, every app.">
      <AuthHeading title="Join an organisation">
        {token
          ? "Accept the invitation to join the organisation you were invited to."
          : "Open the link from your invitation email to accept it."}
      </AuthHeading>
      {notice ? (
        <p className="text-muted-foreground text-sm" role="alert">
          {notice}
        </p>
      ) : null}
      {token ? (
        <form action={acceptInvitation} className="space-y-4">
          <input name="token" type="hidden" value={token} />
          <button
            className="rounded-lg bg-(--auth-accent) px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            type="submit"
          >
            Accept invitation
          </button>
        </form>
      ) : null}
      <a className="text-foreground text-sm underline" href="/organisations">
        Your organisations
      </a>
    </AuthShell>
  );
}
