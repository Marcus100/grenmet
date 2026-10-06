import { getSafeLocalReturnTo } from "@barrelsgd/auth/server";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Barrels Events" };

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ returnTo?: string }> }>) {
  const { returnTo } = await searchParams;
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
      <SignInForm returnTo={getSafeLocalReturnTo(returnTo) ?? "/me"} />
    </section>
  );
}
