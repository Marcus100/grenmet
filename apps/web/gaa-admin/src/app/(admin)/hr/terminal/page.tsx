import type { Metadata } from "next";
import { Suspense } from "react";
import { TerminalWorkspace } from "@/components/hr/terminal/terminal-workspace";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Terminal punches",
  description: "Import fingerprint and fob terminal punches as attendance",
};

export default function TerminalPunchesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Upload the attendance export from a fingerprint or fob terminal, link device IDs to staff, and deal with punches the import could not place."
        title="Terminal punches"
      />
      <Suspense fallback={<p role="status">Loading terminal punches…</p>}>
        <TerminalWorkspace />
      </Suspense>
    </div>
  );
}
