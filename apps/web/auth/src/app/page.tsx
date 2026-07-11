import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { getAuthConfig } from "@/lib/auth-config";
import { formatDate, formatDateTime, getInitials } from "@/lib/profile";
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
  type UserPublic,
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

// Best-effort fetch of the full profile (/auth/users/me). The session
// exchange only returns a trimmed user, so this fills in username and
// member-since; the page degrades to session data when it fails.
async function loadFullProfile(
  accessToken: string
): Promise<UserPublic | null> {
  const config = getAuthConfig();
  try {
    const response = await fetch(
      `${config.authApiBaseUrl}${config.authApiPrefix}/auth/users/me`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as UserPublic;
  } catch {
    return null;
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

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1 border-(--line) border-b py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 font-mono text-(--muted) text-gm-label uppercase tracking-widest">
        {label}
      </dt>
      <dd className="text-foreground text-sm sm:text-right">{value}</dd>
    </div>
  );
}

function ProfileView({
  profile,
  sessionData,
}: {
  profile: UserPublic | null;
  sessionData: SessionAccessTokenResponse;
}) {
  const { session, user } = sessionData;
  const displayName = profile?.full_name || user.full_name || user.email;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div className="rounded-4xl border border-(--line) bg-(--panel) p-8 shadow-gm-card backdrop-blur md:p-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-(--auth-accent) font-semibold text-2xl text-white">
            {getInitials(displayName, user.email)}
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="font-semibold text-3xl text-foreground tracking-normal">
              {displayName}
            </h1>
            <p className="truncate text-(--muted) text-sm leading-6">
              {user.email}
              {profile?.username ? ` · @${profile.username}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--auth-accent-soft) px-3 py-1 font-medium text-(--auth-accent-strong) text-gm-body-sm">
                {user.is_active ? "Active" : "Inactive"}
              </span>
              <span className="rounded-full border border-(--line) bg-white/70 px-3 py-1 font-medium text-(--muted) text-gm-body-sm">
                {user.is_superuser ? "Administrator" : "Staff"}
              </span>
              {session.app_name ? (
                <span className="rounded-full border border-(--line) bg-white/70 px-3 py-1 font-medium text-(--muted) text-gm-body-sm">
                  Signed in via {session.app_name}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-4xl border border-(--line) bg-(--panel-strong) p-6 shadow-gm-card md:p-7">
          <h2 className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Profile
          </h2>
          <dl className="mt-3">
            <ProfileField
              label="Full name"
              value={profile?.full_name || user.full_name}
            />
            <ProfileField label="Username" value={profile?.username ?? null} />
            <ProfileField label="Email" value={user.email} />
            <ProfileField
              label="Member since"
              value={profile ? formatDate(profile.created_at) : null}
            />
          </dl>
        </div>

        <div className="rounded-4xl border border-(--line) bg-(--panel-strong) p-6 shadow-gm-card md:p-7">
          <h2 className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
            Session
          </h2>
          <dl className="mt-3">
            <ProfileField
              label="Started"
              value={formatDateTime(session.created_at)}
            />
            <ProfileField
              label="Last active"
              value={formatDateTime(session.last_used_at)}
            />
            <ProfileField
              label="Expires"
              value={formatDateTime(sessionData.session_expires_at)}
            />
          </dl>
        </div>
      </div>

      <div className="rounded-4xl border border-(--line) bg-(--panel-strong) p-6 shadow-gm-card md:p-7">
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
    </section>
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

  if (sessionData) {
    const profile = await loadFullProfile(sessionData.access_token);
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-10 lg:px-10">
        <ProfileView profile={profile} sessionData={sessionData} />
      </main>
    );
  }

  const returnLabel = getReturnLabel(returnTo);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-10 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <MarketingPanel />

        <section className="rounded-4xl border border-(--line) bg-(--panel-strong) p-7 shadow-gm-card md:p-8">
          <SignedOutPanel
            pageError={pageError}
            requestedApp={requestedApp}
            returnLabel={returnLabel}
            returnTo={returnTo}
          />
        </section>
      </div>
    </main>
  );
}
