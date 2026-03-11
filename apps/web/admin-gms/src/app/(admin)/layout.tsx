import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import AdminLayoutClient from "./AdminLayoutClient";

/** Protects admin routes: redirects to /signin when auth cookie is missing (works even if proxy does not run in dev). */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(AUTH_COOKIE_NAME);
  if (!cookie?.value) {
    redirect("/signin");
  }
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
