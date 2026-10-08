import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import {
  continuePath,
  type HandoffRequest,
  parseHandoffRequest,
  startHandoff,
} from "@/lib/handoff";
import { readQueryParam } from "@/lib/return-to";
import { readSessionCookie } from "@/lib/session";
import { joinApp } from "./actions";

export const metadata: Metadata = { title: "Continue — Barrels account" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function signInPath(request: HandoffRequest, reauth = false): string {
  return `/?${new URLSearchParams({ app: request.app, returnTo: continuePath(request), ...(reauth ? { reauth: "1" } : {}) })}`;
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <AuthShell greeting="Barrels account" subtitle="One account, every app.">
      <AuthHeading title={title}>{children}</AuthHeading>
      <a className="text-foreground text-sm underline" href="/">
        Go to your account
      </a>
    </AuthShell>
  );
}

/**
 * Single sign-on (ADR-0017): an app sent the browser here. If the account is
 * signed in, hand off straight back; otherwise sign in first.
 */
export default async function ContinuePage({ searchParams }: PageProps) {
  noStore();
  const params = await searchParams;
  const request = parseHandoffRequest(
    readQueryParam(params.app),
    readQueryParam(params.state)
  );
  if (!request) {
    return (
      <Notice title="That link didn't work">
        Go back to the app and choose Sign in again.
      </Notice>
    );
  }

  const sessionToken = await readSessionCookie();
  if (!sessionToken) redirect(signInPath(request));

  const result = await startHandoff(request, sessionToken);
  if (result.kind === "redirect") redirect(result.url);
  if (result.kind === "sign-in") redirect(signInPath(request));
  switch (result.kind) {
    case "mfa-enrol":
      return (
        <AuthShell greeting="Barrels account" subtitle="Secure staff access.">
          <AuthHeading title="Set up two-step verification">
            Privileged staff tools require an authenticator. Set it up, save
            recovery codes, then sign in again with your code.
          </AuthHeading>
          <a className="text-foreground text-sm underline" href="/security">
            Open account security
          </a>
        </AuthShell>
      );
    case "mfa-sign-in":
      return (
        <AuthShell greeting="Barrels account" subtitle="Secure staff access.">
          <AuthHeading title="Confirm your two-step sign-in">
            This session was created without an authenticator challenge. Sign in
            again using your authenticator or a saved recovery code.
          </AuthHeading>
          <a
            className="text-foreground text-sm underline"
            href={signInPath(request, true)}
          >
            Sign in again
          </a>
        </AuthShell>
      );
    case "unavailable":
      return (
        <Notice title="Single sign-on isn't available">
          This app can't use your Barrels account yet. Go back and sign in
          there.
        </Notice>
      );
    case "verify-email":
      return (
        <AuthShell
          greeting="Barrels account"
          subtitle="One account, every app."
        >
          <AuthHeading title="Verify your email address">
            Verify your account email, then return to the app and choose Sign in
            again. Administrators must verify their email too.
          </AuthHeading>
          <a className="text-foreground text-sm underline" href="/verify-email">
            Verify email
          </a>
        </AuthShell>
      );
    case "denied":
      return (
        <Notice title={`You don't have access to ${result.label}`}>
          Ask an administrator to give your account access, then try again.
        </Notice>
      );
    case "join":
      return (
        <AuthShell
          greeting="Barrels account"
          subtitle="One account, every app."
        >
          <AuthHeading title={`Join ${result.label}?`}>
            {`You'll use your Barrels account to sign in to ${result.label}. You only need to do this once.`}
          </AuthHeading>
          <form action={joinApp} className="grid grid-cols-2 gap-3">
            <input name="app" type="hidden" value={request.app} />
            <input name="state" type="hidden" value={request.state} />
            <a
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border font-medium text-sm hover:bg-muted"
              href="/"
            >
              Not now
            </a>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground text-sm hover:bg-primary/90"
              type="submit"
            >
              Join {result.label}
            </button>
          </form>
        </AuthShell>
      );
    default:
      return null;
  }
}
