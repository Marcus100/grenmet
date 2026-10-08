import { userPublicSchema } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import {
  authApiFetch,
  exchangeSessionForAccessToken,
  isAuthApiError,
  readSessionCookie,
  type SessionUserPublic,
} from "@/lib/server-session";

/** Protects admin routes even when proxy does not run in development. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionToken = await readSessionCookie();

  if (!sessionToken) {
    redirect("/signin");
  }

  let user: SessionUserPublic | undefined;
  let mfaDetail: string | undefined;
  try {
    const response = await exchangeSessionForAccessToken(sessionToken);
    await authApiFetch("/login/test-token", userPublicSchema, {
      method: "POST",
      accessToken: response.access_token,
    });
    user = response.user;
  } catch (error) {
    // An expired session (401) is normal; an unreachable auth API is not.
    if (
      isAuthApiError(error) &&
      error.status === 403 &&
      (error.detail.startsWith("Set up two-step verification") ||
        error.detail.startsWith("Sign in again with your authenticator"))
    ) {
      mfaDetail = error.detail;
    } else {
      reportError(error, "session");
      redirect("/signin");
    }
  }

  if (mfaDetail) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="font-semibold text-foreground text-xl">
          Two-step verification required
        </h1>
        <p className="text-muted-foreground">{mfaDetail}</p>
        <a
          className="block text-primary underline"
          href={new URL("/security", getAuthConfig().authAppUrl).toString()}
        >
          Open account security
        </a>
        <a className="block text-primary underline" href="/signin">
          Sign in again
        </a>
      </main>
    );
  }
  if (!user) {
    redirect("/signin");
  }

  return (
    <SessionUserProvider user={user}>
      <AppShell
        user={{ name: user.full_name ?? user.email, email: user.email }}
      >
        {children}
      </AppShell>
    </SessionUserProvider>
  );
}
