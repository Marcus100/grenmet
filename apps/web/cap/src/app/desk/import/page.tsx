import type { Metadata } from "next";
import { DeskRefused } from "@/components/desk/desk-panels";
import { ImportForm } from "@/components/desk/import-form";
import { requireDeskGate } from "@/lib/desk/gate";

export const metadata: Metadata = { title: "Import a warning" };
export const dynamic = "force-dynamic";

/** Import one CAP document from a partner feed for review before publishing. */
export default async function ImportWarningPage() {
  const gate = await requireDeskGate("/desk/import");
  if (gate.status === "refused" || !gate.permissions.create) {
    return <DeskRefused email={gate.email} />;
  }
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Import a warning</h1>
        <p className="text-body-sm text-muted-foreground">
          Bring in one CAP 1.2 document from a partner feed. The import becomes
          a draft that you must check before it can be published.
        </p>
      </header>
      <ImportForm />
    </section>
  );
}
