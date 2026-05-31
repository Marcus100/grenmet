import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import {
  getRequestedAppName,
  getSafeReturnTo,
  readQueryParam,
} from "@/lib/return-to";
import {
  exchangeSessionForAccessToken,
  isAuthApiError,
  readSessionCookie,
  type SessionAccessTokenResponse,
} from "@/lib/session";
import {
  refreshSessionAction,
  signOutAction,
  signOutEverywhereAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface SessionState {
  pageError: string | null;
  sessionData: SessionAccessTokenResponse | null;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getReturnLabel(returnTo: string | null): string | null {
  if (!returnTo) return null;
  if (returnTo.startsWith("/")) return returnTo;

  try {
    return new URL(returnTo).host;
  } catch {
    return null;
  }
}

async function loadSessionState(): Promise<SessionState> {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    return {
      pageError: null,
      sessionData: null,
    };
  }

  try {
    return {
      pageError: null,
      sessionData: await exchangeSessionForAccessToken(sessionToken),
    };
  } catch (error) {
    return {
      pageError:
        isAuthApiError(error) && error.status === 401
          ? "Your saved session is no longer valid. Sign in again to continue."
          : "The auth service is unavailable right now. Try again in a moment.",
      sessionData: null,
    };
  }
}

function MarketingPanel() {
  return (
    <section className="rounded-4xl border border-(--line) bg-(--panel) p-8 shadow-gm-card backdrop-blur md:p-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-(--line) bg-white/70 px-3 py-1 font-medium font-mono text-(--muted) text-gm-label uppercase tracking-widest">
          Grenmet Shared Auth
        </span>
        <span className="rounded-full bg-(--auth-accent-soft) px-3 py-1 font-medium text-(--auth-accent-strong) text-gm-body-sm">
          FastAPI session-backed
        </span>
      </div>

      <div className="mt-8 max-w-2xl space-y-5">
        <h1 className="max-w-xl font-semibold text-4xl text-foreground tracking-normal md:text-6xl">
          One login surface for every Grenmet web app.
        </h1>
        <p className="max-w-xl text-(--muted) text-gm-body leading-7 md:text-gm-body-base">
          The browser only keeps an opaque session secret in an HttpOnly cookie.
          FastAPI stays authoritative for sign-in, token exchange, rotation, and
          logout.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-gm-8 border border-(--line) bg-(--panel-strong) p-4">
          <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Cookie Model
          </div>
          <p className="mt-2 text-foreground text-sm leading-6">
            Shared session cookie owned by the auth app, not a browser-readable
            JWT.
          </p>
        </div>
        <div className="rounded-gm-8 border border-(--line) bg-(--panel-strong) p-4">
          <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Authority
          </div>
          <p className="mt-2 text-foreground text-sm leading-6">
            FastAPI issues and revokes sessions, and mints short-lived access
            tokens on demand.
          </p>
        </div>
        <div className="rounded-gm-8 border border-(--line) bg-(--panel-strong) p-4">
          <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Flow
          </div>
          <p className="mt-2 text-foreground text-sm leading-6">
            Sign in here once, then redirect back into the app that requested
            auth.
          </p>
        </div>
      </div>
    </section>
  );
}

function AuthenticatedPanel({
  sessionData,
}: {
  sessionData: SessionAccessTokenResponse;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
          Active session
        </div>
        <h2 className="font-semibold text-3xl text-foreground tracking-normal">
          {sessionData.user.full_name || sessionData.user.email}
        </h2>
        <p className="text-(--muted) text-sm leading-6">
          Signed in as {sessionData.user.email}
          {sessionData.session.app_name
            ? ` for ${sessionData.session.app_name}`
            : ""}
          .
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-gm-8 border border-(--line) bg-white/70 p-4">
          <dt className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Session expires
          </dt>
          <dd className="mt-2 text-foreground text-sm">
            {formatTimestamp(sessionData.session_expires_at)}
          </dd>
        </div>
        <div className="rounded-gm-8 border border-(--line) bg-white/70 p-4">
          <dt className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Last used
          </dt>
          <dd className="mt-2 text-foreground text-sm">
            {formatTimestamp(sessionData.session.last_used_at)}
          </dd>
        </div>
      </dl>

      <div className="rounded-gm-8 border border-(--line) bg-(--auth-accent-soft) p-4 text-(--auth-accent-strong) text-sm leading-6">
        This app validated your cookie through /login/session/access-token. Use
        the controls below to rotate the session or revoke it in FastAPI.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <form action={refreshSessionAction}>
          <button
            className="w-full rounded-full bg-(--auth-accent) px-5 py-3 font-medium text-sm text-white transition hover:bg-(--auth-accent-strong)"
            type="submit"
          >
            Extend session
          </button>
        </form>
        <form action={signOutAction}>
          <button
            className="w-full rounded-full border border-(--line) px-5 py-3 font-medium text-foreground text-sm transition hover:bg-white/60"
            type="submit"
          >
            Sign out here
          </button>
        </form>
        <form action={signOutEverywhereAction}>
          <button
            className="w-full rounded-full border border-(--line) px-5 py-3 font-medium text-foreground text-sm transition hover:bg-white/60"
            type="submit"
          >
            Sign out everywhere
          </button>
        </form>
      </div>
    </div>
  );
}

function SignedOutPanel({
  pageError,
  requestedApp,
  returnLabel,
  returnTo,
}: {
  pageError: string | null;
  requestedApp: string | null;
  returnLabel: string | null;
  returnTo: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
          {requestedApp ? `Sign in for ${requestedApp}` : "Sign in"}
        </div>
        <h2 className="font-semibold text-3xl text-foreground tracking-normal">
          Authenticate once, then move back into the app.
        </h2>
        <p className="text-(--muted) text-sm leading-6">
          {returnLabel
            ? `After sign-in, you will be sent to ${returnLabel}.`
            : "Use this page as the central login entry point for Grenmet web apps."}
        </p>
      </div>

      {pageError ? (
        <div className="rounded-gm-8 border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {pageError}
        </div>
      ) : null}

      <SignInForm appName={requestedApp} returnTo={returnTo} />

      <p className="text-(--muted) text-gm-body-sm leading-6">
        Allowed absolute return destinations are controlled by the
        AUTH_ALLOWED_RETURN_HOSTS env var. Relative paths are always allowed.
      </p>
    </div>
  );
}

export default async function Home({ searchParams }: PageProps) {
  noStore();

  const params = await searchParams;
  const returnTo = getSafeReturnTo(readQueryParam(params.returnTo));
  const requestedApp = getRequestedAppName(
    readQueryParam(params.app),
    returnTo
  );
  const { pageError, sessionData } = await loadSessionState();

  if (sessionData && returnTo) {
    redirect(returnTo);
  }

  const returnLabel = getReturnLabel(returnTo);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-10 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <MarketingPanel />

        <section className="rounded-4xl border border-(--line) bg-(--panel-strong) p-7 shadow-gm-card md:p-8">
          {sessionData ? (
            <AuthenticatedPanel sessionData={sessionData} />
          ) : (
            <SignedOutPanel
              pageError={pageError}
              requestedApp={requestedApp}
              returnLabel={returnLabel}
              returnTo={returnTo}
            />
          )}
        </section>
      </div>
    </main>
  );
}
