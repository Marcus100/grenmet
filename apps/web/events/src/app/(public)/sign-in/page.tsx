import { getSafeLocalReturnTo } from "@barrelsgd/auth/server";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Barrels Events" };

export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ returnTo?: string; sign_in?: string }>;
}>) {
  const { returnTo, sign_in: signIn } = await searchParams;
  const destination = getSafeLocalReturnTo(returnTo) ?? "/me";
  // Sign in with the Barrels account on auth.barrels.gd (ADR-0017): password,
  // Google or an email code, all in one place. A failed attempt lands back
  // here with sign_in=expired rather than looping.
  if (env.EVENTS_SSO_CLIENT_SECRET && signIn !== "expired") {
    redirect(`/auth/start?${new URLSearchParams({ returnTo: destination })}`);
  }
  return (
    <section className="mx-auto max-w-sm space-y-6 py-10">
      <div className="space-y-2">
        <h1 className="font-bold font-display text-heading-2">
          Sign in to Barrels Events
        </h1>
        <p className="text-body text-muted-foreground">
          {env.EVENTS_SSO_CLIENT_SECRET
            ? "That sign-in link expired."
            : "We'll email you a one-time code. New here? The same code creates your account."}
        </p>
      </div>
      {env.EVENTS_SSO_CLIENT_SECRET ? (
        <a
          className={cn(buttonVariants(), "w-full")}
          href={`/auth/start?${new URLSearchParams({ returnTo: destination })}`}
        >
          Try again
        </a>
      ) : (
        <SignInForm returnTo={destination} />
      )}
    </section>
  );
}
