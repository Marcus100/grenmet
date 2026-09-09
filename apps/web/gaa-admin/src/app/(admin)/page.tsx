import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertsPanel } from "./_components/alerts-panel";
import { ApprovalsPanel } from "./_components/approvals-panel";
import { DutyPanel } from "./_components/duty-panel";
import { ImageryPanel } from "./_components/imagery-panel";
import { LiveRefresh } from "./_components/live-refresh";
import { PanelSkeleton } from "./_components/panel";
import { ProductsPanel } from "./_components/products-panel";
import { StatusStrip } from "./_components/status-strip";

// Every panel reads a live source (CAP, wxproducts, WxWatch, the HR API), so
// the page is rendered per request and streamed panel by panel.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  description: "Grenada Meteorological Service — operations dashboard",
};

function StripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {["a", "b", "c", "d"].map((key) => (
        <PanelSkeleton key={key} rows={1} />
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Operations</h1>
          <p className="text-muted-foreground text-sm">
            Live across CAP, the product desk, WxWatch and HR.
          </p>
        </div>
        <LiveRefresh />
      </div>

      <Suspense fallback={<StripSkeleton />}>
        <StatusStrip />
      </Suspense>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <AlertsPanel className="lg:col-span-2" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <ProductsPanel />
        </Suspense>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <Suspense fallback={<PanelSkeleton rows={2} />}>
          <ImageryPanel className="lg:col-span-2" />
        </Suspense>
        <div className="flex flex-col gap-4 md:gap-6">
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <DutyPanel />
          </Suspense>
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <ApprovalsPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
