import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSafeLocalReturnTo, readQueryParam } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Redirecting To Sign In",
  description: "Signing in with your Barrels account.",
};

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Single sign-on (ADR-0017): /auth/start hands off to auth.barrels.gd. */
export default async function SignIn({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnTo = getSafeLocalReturnTo(readQueryParam(params.returnTo)) ?? "/";
  redirect(`/auth/start?${new URLSearchParams({ returnTo })}`);
}
