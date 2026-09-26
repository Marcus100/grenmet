import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusHeader } from "@/components/bus/portal";
import { StopsManager } from "@/components/bus/stops-manager";
import {
  getTransportAccess,
  getTransportCatalogue,
} from "@/db/transport/queries";

export const metadata: Metadata = {
  title: "Bus stops",
  description:
    "Pickup and drop-off points for the GAA staff bus, with map locations and landmarks.",
};

export const dynamic = "force-dynamic";

export default async function BusStopsPage() {
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const [access, catalogue] = await Promise.all([
    getTransportAccess(),
    getTransportCatalogue(),
  ]);
  if (!access.canView) notFound();

  return (
    <div className="space-y-6">
      <BusHeader crumbs={[{ href: "/bus", label: "Bus" }]} title="Stops">
        Pickup and drop-off points. Codes are printed on stop signs and QR
        labels; landmarks help new riders find the stop.
      </BusHeader>
      <StopsManager
        canManage={access.canManageTimetable}
        stops={catalogue.stops}
      />
    </div>
  );
}
