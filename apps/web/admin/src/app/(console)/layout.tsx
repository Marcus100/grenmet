import { Separator } from "@barrelsgd/ui/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@barrelsgd/ui/components/ui/sidebar";
import { MAIN_CONTENT_ID } from "@barrelsgd/ui/components/ui/skip-link";
import { cookies } from "next/headers";
import { ConsoleSidebar } from "@/components/console-sidebar";
import { StaffOnly } from "@/components/staff-only";
import { requireGate } from "@/lib/staff-gate";

// Every page re-checks the gate itself: layouts and pages render in parallel,
// so the shell alone must never be what protects data.
export const dynamic = "force-dynamic";

/**
 * The console shell follows the GMS portal (gaa-admin): a collapsible inset
 * sidebar with grouped navigation and the signed-in user, a slim top bar, and
 * a padded content area. It uses only shared tokens (docs/design/admin.md).
 */
export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const gate = await requireGate();
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
        } as React.CSSProperties
      }
    >
      <ConsoleSidebar email={gate.email} name={gate.name} />
      <SidebarInset className="min-w-0 overflow-x-hidden peer-data-[variant=inset]:border">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            orientation="vertical"
          />
          <span className="text-muted-foreground text-sm">
            Barrels control plane
          </span>
        </header>
        <main
          className="flex min-w-0 flex-1 flex-col gap-4 p-4 outline-none md:gap-6 md:p-6"
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
