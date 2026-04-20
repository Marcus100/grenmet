import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildSharedSignInUrl, getRequestOrigin } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Redirecting To Sign In",
  description: "Forwarding to the shared Grenmet sign-in app.",
};

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readQueryParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first ? first.trim() || null : null;
  }
  return null;
}

export default async function SignIn({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();

  redirect(
    buildSharedSignInUrl({
      origin: getRequestOrigin(requestHeaders),
      returnTo: readQueryParam(params.returnTo),
    })
  );
}
