import { getSafeLocalReturnTo } from "@barrelsgd/auth/server";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
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
  return (
    <section className="mx-auto max-w-sm space-y-6 py-10">
      <div className="space-y-2">
        <h1 className="font-bold font-display text-heading-2">
          Sign in to Barrels Events
        </h1>
        <p className="text-body text-muted-foreground">
          We'll email you a one-time code. New here? The same code creates your
          account.
        </p>
      </div>
      {signIn === "expired" ? (
        <p
          className="rounded-lg border border-border bg-muted px-4 py-3 text-body"
          role="status"
        >
          That sign-in link expired. Try again.
        </p>
      ) : null}
      {env.EVENTS_SSO_CLIENT_SECRET ? (
        <>
          {/* Single sign-on (ADR-0017): a plain link, so the browser leaves for auth. */}
          <a
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            href={`/auth/start?${new URLSearchParams({ returnTo: destination })}`}
          >
            Continue with your Barrels account
          </a>
          <p className="text-center text-body-sm text-muted-foreground">
            or use an email code
          </p>
        </>
      ) : null}
      <SignInForm returnTo={destination} />
    </section>
  );
}
