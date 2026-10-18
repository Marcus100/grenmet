import { MAIN_CONTENT_ID } from "@barrelsgd/ui/components/ui/skip-link";
import Link from "next/link";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="leading-tight" href="/">
            <span className="block font-semibold">GMS Dashboard</span>
            <span className="block text-muted-foreground text-xs">
              Grenada Meteorological Service
            </span>
          </Link>
          <nav aria-label="Main" className="flex gap-4 text-sm">
            <Link
              className="underline-offset-4 hover:underline"
              href="/meteogram"
            >
              Meteogram
            </Link>
            <Link className="underline-offset-4 hover:underline" href="/access">
              Access
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-muted-foreground">{session.email}</span>
                <form action="/auth/logout" method="post">
                  <button
                    className="rounded-md border px-2.5 py-1 hover:bg-muted"
                    type="submit"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <a
                className="rounded-md border px-2.5 py-1 hover:bg-muted"
                href="/auth/start"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 outline-none"
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="border-t px-4 py-4 text-center text-muted-foreground text-xs">
        A Grenada Meteorological Service client service, built by Barrels
        Grenada. Model guidance is not an official forecast.
      </footer>
    </div>
  );
}
