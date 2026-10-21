import { Button } from "@barrelsgd/ui/components/ui/button";
import { getSession } from "@/lib/session";

// Per-person pages: never prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * The signed-in name and Sign out sit in the header on every studio screen.
 * Pages own the sign-in redirect (they know the full path), so without a
 * session the header is left out and a deep link survives an expired session.
 */
export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <div className="flex min-h-screen flex-col">
      {session ? (
        <header className="border-border border-b">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
            <span className="font-semibold">Barrels Bookings studio</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">
                {session.name}
              </span>
              <form action="/auth/logout" method="post">
                <Button className="min-h-11" type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </header>
      ) : null}
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6"
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
