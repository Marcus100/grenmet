import { MAIN_CONTENT_ID } from "@barrelsgd/ui/components/ui/skip-link";
import Link from "next/link";
import { StaffOnly } from "@/components/staff-only";
import { requireGate } from "@/lib/staff-gate";

// Every page re-checks the gate itself: layouts and pages render in parallel,
// so the shell alone must never be what protects data.
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const gate = await requireGate();
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">Barrels admin</span>
          <nav aria-label="Console" className="flex gap-4 text-sm">
            <Link className="underline-offset-4 hover:underline" href="/">
              Overview
            </Link>
            <Link
              className="underline-offset-4 hover:underline"
              href="/organisations"
            >
              Organisations
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{gate.email}</span>
            <form action="/auth/logout" method="post">
              <button
                className="rounded-md border px-2.5 py-1 hover:bg-muted"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 outline-none"
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
