import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildSharedSignInUrl,
  getRequestOrigin,
  readQueryParam,
} from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Redirecting To Sign In",
  description: "Forwarding to the shared Grenmet sign-in app.",
};

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
