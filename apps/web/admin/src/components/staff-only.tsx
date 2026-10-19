import { env } from "@/lib/env";

/**
 * Refusal for signed-in accounts that are not Barrels superusers. It carries no
 * data and no navigation, so nothing about the control plane leaks.
 */
export function StaffOnly({ email }: { email?: string }) {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6"
      id="main-content"
    >
      <h1 className="font-semibold text-2xl">Barrels staff only</h1>
      <p className="text-muted-foreground">
        This console is for Barrels Grenada staff. Your account
        {email ? ` (${email})` : ""} does not have access.
      </p>
      <p className="text-muted-foreground">
        If you should have access, ask a Barrels administrator. Otherwise use
        the apps on your{" "}
        <a className="underline" href={env.AUTH_APP_URL}>
          Barrels account
        </a>
        .
      </p>
      <form action="/auth/logout" method="post">
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          type="submit"
        >
          Sign out of this console
        </button>
      </form>
    </main>
  );
}
