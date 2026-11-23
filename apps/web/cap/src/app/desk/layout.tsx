import type { Metadata, Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeskApiClient } from "@/components/desk/api-client";
import { getDeskGate } from "@/lib/desk/gate";
import type { DeskPermissions } from "@/lib/desk/permissions";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: { default: "Warning desk", template: "%s | Warning desk" },
};

interface NavItem {
  href: Route;
  label: string;
  /** Shown only when this returns true; no entry means every signed-in staff member. */
  need?: (permissions: DeskPermissions) => boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/desk", label: "Board" },
  { href: "/desk/new", label: "New warning", need: (p) => p.create },
  { href: "/desk/escalations", label: "GMS alerts", need: (p) => p.create },
  { href: "/desk/areas", label: "Areas", need: (p) => p.read },
  { href: "/desk/audit", label: "Audit", need: (p) => p.read },
  { href: "/desk/statistics", label: "Statistics", need: (p) => p.read },
  { href: "/desk/feeds", label: "Feeds", need: (p) => p.feedsManage },
  {
    href: "/desk/integrations",
    label: "Integrations",
    need: (p) => p.integrationsManage,
  },
  { href: "/desk/settings", label: "Settings", need: (p) => p.settingsManage },
  { href: "/desk/matrix", label: "Impact matrix" },
  { href: "/desk/profiles", label: "Hazard profiles" },
  { href: "/desk/import", label: "Import", need: (p) => p.create },
  { href: "/", label: "Public alerts" },
];

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
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold" href="/desk">
            GMS warning desk
          </Link>
          {gate.status === "staff" ? (
            <nav aria-label="Desk" className="text-body-sm flex gap-4">
              {NAV_ITEMS.filter(
                (item) => !item.need || item.need(gate.permissions)
              ).map((item) => (
                <Link
                  className="text-info hover:underline"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {gate.status === "signed-out" ? null : (
            <form
              action="/auth/logout"
              className="text-body-sm ml-auto flex items-center gap-3"
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
