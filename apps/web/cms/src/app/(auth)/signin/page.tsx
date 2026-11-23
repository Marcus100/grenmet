import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import type { Metadata } from "next";

// Single sign-on (ADR-0017): /auth/start hands off to auth.barrels.gd, which
// signs the person in with their Barrels account and returns them to /admin.

export const metadata: Metadata = {
  title: "Sign in | GMS content",
  description: "Sign in to GMS content with your Barrels account.",
};

export const dynamic = "force-dynamic";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ sign_in?: string }>;
}) {
  const { sign_in: signIn } = await searchParams;
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-4"
      id="main-content"
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-lg text-base font-semibold"
          >
            B
          </span>
          <p className="text-muted-foreground text-sm">GMS content</p>
          <CardTitle className="text-xl">
            <h1>Sign in with your Barrels account</h1>
          </CardTitle>
          <CardDescription>
            Use the account you use for other Barrels apps.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {signIn === "expired" ? (
            <p
              className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm"
              role="alert"
            >
              That sign-in link expired or was refused. Try again.
            </p>
          ) : null}
          <Button
            className="min-h-11 w-full"
            nativeButton={false}
            render={<a href="/auth/start?returnTo=%2Fadmin" />}
          >
            Sign in
          </Button>
        </CardContent>
        <CardFooter className="text-muted-foreground text-sm">
          <p>
            Use a verified email or an administrator-approved staff account. A
            system administrator gives access: system administrators have full
            CMS access, and other accounts need Writer or Publisher access.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
