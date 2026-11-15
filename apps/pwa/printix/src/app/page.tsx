import { InstallHint } from "@/components/install-hint";
import { Scanner } from "@/components/scanner";

export default function ScanPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Printix Scanner
        </h1>
        <span className="text-px-muted text-xs">Barcode test</span>
      </header>
      <Scanner />
      <InstallHint />
    </main>
  );
}
