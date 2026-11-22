import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import { env } from "@/lib/env";

/**
 * Refusal for signed-in accounts that are not Barrels superusers, and for any
 * page that is staff-only. It shows who is signed in, how to switch account,
 * where to go instead and who can grant access. It carries no data and no
 * navigation into the console, so nothing about the control plane leaks.
 */
export function StaffOnly({ email }: { email?: string }) {
  return (
    <main
      className="flex min-h-[70vh] items-center justify-center p-4"
      id="main-content"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-lg text-base font-semibold"
          >
            B
          </span>
          <CardTitle className="text-xl">
            <h1>Barrels staff only</h1>
          </CardTitle>
          <CardDescription>
            This console is for Barrels Grenada staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>
            {email ? (
              <>
                You are signed in as{" "}
                <span className="font-medium">{email}</span>, and that account
                does not have access.
              </>
            ) : (
              "The account you are signed in with does not have access."
            )}
          </p>
          <div>
            <h2 className="font-medium">Who to ask</h2>
            <p className="text-muted-foreground">
              A Barrels administrator can give your account access. If you
              expected to see this console, ask them to check the account you
              are signed in with.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row">
          <form
            action="/auth/logout"
            className="w-full sm:w-auto"
            method="post"
          >
            <Button className="min-h-11 w-full sm:w-auto" type="submit">
              Switch account
            </Button>
          </form>
          <Button
            className="min-h-11 w-full sm:w-auto"
            nativeButton={false}
            render={<a href={env.AUTH_APP_URL} />}
            variant="outline"
          >
            Go to your account
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
