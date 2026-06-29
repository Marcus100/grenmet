"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@grenmet/ui/components/ui/sheet";
import * as React from "react";

import { shipments } from "./shipment-data";
import { ShipmentDetails } from "./shipment-details";
import { ShipmentList } from "./shipment-list";

export function Logistics() {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = React.useState<
    string | null
  >(shipments[0].id);
  const selectedShipment =
    shipments.find((shipment) => shipment.id === selectedShipmentId) ??
    shipments[0];

  function handleSelectShipment(shipmentId: string) {
    setSelectedShipmentId(shipmentId);

    if (window.innerWidth < 1024) {
      setDetailsOpen(true);
    }
  }

  return (
    <>
      <div
        className="grid h-[calc(100dvh-var(--dashboard-header-height))] overflow-hidden lg:grid-cols-[400px_minmax(0,1fr)] lg:divide-x"
        data-content-padding="false"
      >
        <div className="h-full overflow-hidden">
          <ShipmentList
            onSelectShipment={handleSelectShipment}
            selectedShipmentId={selectedShipmentId}
            shipments={shipments}
          />
        </div>
        <div className="hidden h-full overflow-hidden lg:block">
          <ShipmentDetails shipment={selectedShipment} />
        </div>
      </div>

      <Sheet onOpenChange={setDetailsOpen} open={detailsOpen}>
        <SheetContent
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-3/4"
          side="right"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {selectedShipment
                ? `Shipment ${selectedShipment.id}`
                : "Shipment details"}
            </SheetTitle>
            <SheetDescription>
              Selected shipment details and route map.
            </SheetDescription>
          </SheetHeader>
          <ShipmentDetails shipment={selectedShipment} />
        </SheetContent>
      </Sheet>
    </>
  );
}
