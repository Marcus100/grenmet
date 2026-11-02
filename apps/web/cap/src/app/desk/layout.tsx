import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeskApiClient } from "@/components/desk/api-client";
import { getDeskGate } from "@/lib/desk/gate";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: { default: "Warning desk", template: "%s | Warning desk" },
};

/**
 * The staff warning desk's chrome. Each page checks the gate itself (layouts
 * and pages render in parallel); this only shows who is signed in.
 */
export default async function DeskLayout({
  children,
}: {
  children: ReactNode;
}) {
  const gate = await getDeskGate();
  return (
    <>
      <DeskApiClient />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold" href="/desk">
            GMS warning desk
          </Link>
          {gate.status === "staff" ? (
            <nav aria-label="Desk" className="flex gap-4 text-body-sm">
              <Link className="text-info hover:underline" href="/desk">
                Board
              </Link>
              {gate.permissions.create ? (
                <Link className="text-info hover:underline" href="/desk/new">
                  New warning
                </Link>
              ) : null}
              {gate.permissions.read ? (
                <Link className="text-info hover:underline" href="/desk/areas">
                  Areas
                </Link>
              ) : null}
              {gate.permissions.read ? (
                <Link className="text-info hover:underline" href="/desk/audit">
                  Audit
                </Link>
              ) : null}
              {gate.permissions.feedsManage ? (
                <Link className="text-info hover:underline" href="/desk/feeds">
                  Feeds
                </Link>
              ) : null}
              {gate.permissions.integrationsManage ? (
                <Link
                  className="text-info hover:underline"
                  href="/desk/integrations"
                >
                  Integrations
                </Link>
              ) : null}
              {gate.permissions.settingsManage ? (
                <Link
                  className="text-info hover:underline"
                  href="/desk/settings"
                >
                  Settings
                </Link>
              ) : null}
              <Link className="text-info hover:underline" href="/desk/matrix">
                Impact matrix
              </Link>
              <Link className="text-info hover:underline" href="/desk/profiles">
                Hazard profiles
              </Link>
              {gate.permissions.create ? (
                <Link className="text-info hover:underline" href="/desk/import">
                  Import
                </Link>
              ) : null}
              <Link className="text-info hover:underline" href="/">
                Public alerts
              </Link>
            </nav>
          ) : null}
          {gate.status === "signed-out" ? null : (
            <form
              action="/auth/logout"
              className="ml-auto flex items-center gap-3 text-body-sm"
              method="post"
            >
              <span className="text-muted-foreground">
                {gate.status === "staff" ? gate.name : gate.email}
              </span>
              <button className="text-info underline" type="submit">
                Log out
              </button>
            </form>
          )}
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-6xl flex-1 p-4 outline-none md:p-6"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </>
  );
}
