import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { getAppDisplayName } from "@/components/app-directory";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/SignInForm";
import { getAppHrefs } from "@/lib/app-links";
import { getAuthConfig } from "@/lib/auth-config";
import { formatDate, getInitials } from "@/lib/profile";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface SessionState {
  pageError: string | null;
  sessionData: SessionAccessTokenResponse | null;
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

function AccountProfile({
  adminHref,
  profile,
  sessionData,
}: {
  adminHref: string | undefined;
  profile: UserPublic | null;
  sessionData: SessionAccessTokenResponse;
}) {
  const { user } = sessionData;
  const displayName = profile?.full_name || user.full_name || user.email;
  const editLink = adminHref ? (
    <a
      className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted"
      href={`${adminHref}/profile`}
    >
      Edit in GAA Admin
    </a>
  ) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-(--auth-accent) font-semibold text-white text-xl">
          {getInitials(displayName, user.email)}
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="truncate font-semibold text-foreground text-xl">
            {displayName}
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">
              {user.is_superuser ? "Administrator" : "Staff"}
            </StatusBadge>
            {user.is_active ? null : (
              <StatusBadge tone="off">Inactive</StatusBadge>
            )}
          </div>
        </div>
      </div>

      <SettingsSection title="Details">
        <SettingsRow action={editLink} description={displayName} title="Name" />
        <SettingsRow
          description={profile?.username ? `@${profile.username}` : "Not set"}
          title="Username"
        />
        <SettingsRow description={user.email} title="Email" />
        {profile ? (
          <SettingsRow
            description={formatDate(profile.created_at)}
            title="Member since"
          />
        ) : null}
      </SettingsSection>
      <p className="text-muted-foreground text-sm">
        Your name and username are managed in GAA Admin so HR records stay in
        step.
      </p>
    </div>
  );
}

function signedOutNotice(
  pageError: string | null,
  sessionParam: string | null
): string | null {
  if (pageError) return pageError;
  if (sessionParam === "expired") {
    return "Your session expired. Sign in again to continue.";
  }
  return null;
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
      <AccountLayout
        current="/"
        description="How you appear across GAA, GMS and Barrels apps."
        title="Profile"
      >
        <AccountProfile
          adminHref={getAppHrefs().admin}
          profile={profile}
          sessionData={sessionData}
        />
      </AccountLayout>
    );
  }

  const appLabel = getAppDisplayName(requestedApp);
  const notice = signedOutNotice(pageError, readQueryParam(params.session));

  return (
    <AuthShell
      greeting="Hello again"
      requestedApp={requestedApp}
      subtitle="Sign in to continue."
    >
      <AuthHeading
        title={appLabel ? `Sign in to ${appLabel}` : "Sign in to your account"}
      >
        Use your work email, or continue with Google.
      </AuthHeading>

      {notice ? (
        <div
          className="rounded-lg border border-border bg-muted px-4 py-3 text-foreground text-sm"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <SignInForm appName={requestedApp} returnTo={returnTo} />
    </AuthShell>
  );
}
