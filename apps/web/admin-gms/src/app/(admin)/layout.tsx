import { redirect } from "next/navigation";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";
import AdminLayoutClient from "./AdminLayoutClient";

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

  let user;
  try {
    const response = await exchangeSessionForAccessToken(sessionToken);
    user = response.user;
  } catch {
    redirect("/signin");
  }

  return <AdminLayoutClient user={user}>{children}</AdminLayoutClient>;
}
