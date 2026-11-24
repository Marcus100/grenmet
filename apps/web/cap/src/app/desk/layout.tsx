import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeskApiClient } from "@/components/desk/api-client";
import { getDeskGate } from "@/lib/desk/gate";
import { deskNavItems } from "@/lib/desk/nav";

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
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold" href="/desk">
            GMS warning desk
          </Link>
          {gate.status === "staff" ? (
            <nav
              aria-label="Desk"
              className="text-body-sm flex min-w-0 flex-wrap gap-x-3 gap-y-1"
            >
              {deskNavItems(gate.permissions).map((item) => (
                <Link
                  className="text-info inline-flex min-h-11 items-center px-1 hover:underline"
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
              <button
                className="text-info inline-flex min-h-11 items-center underline"
                type="submit"
              >
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
