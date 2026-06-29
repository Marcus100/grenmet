import { SessionUserProvider } from "@grenmet/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  exchangeSessionForAccessToken,
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
  try {
    const response = await exchangeSessionForAccessToken(sessionToken);
    user = response.user;
  } catch {
    redirect("/signin");
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
