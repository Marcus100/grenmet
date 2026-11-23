import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { NamePrompt, VerifyBanner } from "@/components/account-notices";
import { getAppDisplayName } from "@/components/app-directory";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { OrDivider } from "@/components/or-divider";
import { SignInForm } from "@/components/SignInForm";
import {
  CreateAccountLink,
  GoogleSignInLink,
} from "@/components/sign-in-options";
import { StaffAccess } from "@/components/staff-access";
import { getAppHrefs } from "@/lib/app-links";
import { getAuthConfig } from "@/lib/auth-config";
import { formatDate, getInitials } from "@/lib/profile";
import { reportError } from "@/lib/report-error";
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
import { signInPath } from "@/lib/sign-in-links";
import { loadSecurity } from "./security/actions";

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
    reportError(error, "auth-session");
    return {
      pageError:
        isAuthApiError(error) && error.status === 401
          ? "Your saved session is no longer valid. Sign in again to continue."
          : "The auth service is unavailable right now. Try again in a moment.",
      sessionData: null,
    };
  }
}

// Whether the email is confirmed. Null when security details cannot be loaded;
// the banner is then simply not shown (it never blocks the page).
async function loadEmailVerified(): Promise<boolean | null> {
  try {
    return (await loadSecurity()).email_verified;
  } catch (error) {
    reportError(error, "auth-account-notices");
    return null;
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
  // Accounts without staff approval are ordinary Barrels accounts (ADR-0017).
  const isStaff = profile ? !profile.registration_pending : true;
  const editLink =
    adminHref && isStaff ? (
      <a
        className="border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-medium transition"
        href={`${adminHref}/profile`}
      >
        Edit in GAA Admin
      </a>
    ) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="bg-primary text-primary-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold">
          {getInitials(displayName, user.email)}
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-foreground truncate text-xl font-semibold">
            {displayName}
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">
              {(() => {
                if (user.is_superuser) return "Administrator";
                return isStaff ? "Staff" : "Barrels account";
              })()}
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
      {isStaff ? (
        <p className="text-muted-foreground text-sm">
          Your name and username are managed in GAA Admin so HR records stay in
          step.
        </p>
      ) : (
        <StaffAccess requestedAt={profile?.staff_access_requested_at ?? null} />
      )}
    </div>
  );
}

function signedOutNotice(
  pageError: string | null,
  sessionParam: string | null,
  noticeParam: string | null
): string | null {
  if (pageError) return pageError;
  if (sessionParam === "expired") {
    return "Your session expired. Sign in again to continue.";
  }
  // Fixed codes only: an unknown notice shows nothing, and no query text is echoed.
  if (noticeParam === "email-changed") {
    return "Your email address has changed. Sign in with the new address.";
  }
  return null;
}

/**
 * This URL is the sign-in form when signed out and the profile when signed in,
 * so the title follows the session cookie. Presence only: no second session
 * exchange here (the page does that once, below).
 */
export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const reauthenticating = readQueryParam(params.reauth) === "1";
  const hasSessionCookie = await readSessionCookie();
  if (hasSessionCookie && !reauthenticating) {
    return { title: "Your account" };
  }
  const appLabel = getAppDisplayName(
    getRequestedAppName(
      readQueryParam(params.app),
      getSafeReturnTo(readQueryParam(params.returnTo))
    )
  );
  return { title: appLabel ? `Sign in to ${appLabel}` : "Sign in" };
}

export default async function Home({ searchParams }: PageProps) {
  noStore();

  const params = await searchParams;
  const returnTo = getSafeReturnTo(readQueryParam(params.returnTo));
  const requestedApp = getRequestedAppName(
    readQueryParam(params.app),
    returnTo
  );
  const { pageError, sessionData } =
    readQueryParam(params.reauth) === "1"
      ? { pageError: null, sessionData: null }
      : await loadSessionState();

  if (sessionData && returnTo) {
    redirect(returnTo);
  }

  if (sessionData) {
    const profile = await loadFullProfile(sessionData.access_token);
    const emailVerified = await loadEmailVerified();
    return (
      <AccountLayout
        current="/"
        description="How you appear across GAA, GMS and Barrels apps."
        title="Profile"
      >
        <div className="space-y-8">
          {emailVerified === false ? <VerifyBanner /> : null}
          {profile?.registration_pending && !profile.last_name.trim() ? (
            <NamePrompt />
          ) : null}
          <AccountProfile
            adminHref={getAppHrefs().admin}
            profile={profile}
            sessionData={sessionData}
          />
        </div>
      </AccountLayout>
    );
  }

  const appLabel = getAppDisplayName(requestedApp);
  const notice = signedOutNotice(
    pageError,
    readQueryParam(params.session),
    readQueryParam(params.notice)
  );
  // Code first: the emailed code is the default and a password is asked for.
  // A reauthentication step keeps the password form, as it always has.
  const passwordMode =
    readQueryParam(params.method) === "password" ||
    readQueryParam(params.reauth) === "1";
  const heading = appLabel
    ? `Sign in to ${appLabel}`
    : "Sign in to your account";

  if (passwordMode) {
    // A reauthentication step (MFA) must be met with the password. The code
    // route cannot satisfy it, and a code sign-in would be bounced back here.
    const reauthenticating = readQueryParam(params.reauth) === "1";
    return (
      <AuthShell>
        <AuthHeading title={heading}>
          Use your email and password, or continue with Google.
        </AuthHeading>
        {notice ? (
          <div
            className="border-border bg-muted text-foreground rounded-lg border px-4 py-3 text-sm"
            role="status"
          >
            {notice}
          </div>
        ) : null}
        <SignInForm
          appName={requestedApp}
          codeHref={
            reauthenticating
              ? null
              : signInPath("/", { app: requestedApp, returnTo })
          }
          returnTo={returnTo}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading title={heading}>
        Enter your email and we’ll send you a 6-digit code. No password needed.
      </AuthHeading>

      {notice ? (
        <div
          className="border-border bg-muted text-foreground rounded-lg border px-4 py-3 text-sm"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <EmailCodeForm
        passwordHref={signInPath("/", {
          app: requestedApp,
          method: "password",
          returnTo,
        })}
        returnTo={returnTo}
      />
      <OrDivider />
      <GoogleSignInLink returnTo={returnTo} />
      <CreateAccountLink returnTo={returnTo} />
    </AuthShell>
  );
}
