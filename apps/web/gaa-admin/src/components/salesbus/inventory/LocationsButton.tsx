"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/salesbus/ui";
import { AddLocationDialog } from "./StockDialogs";

export function LocationsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="flex items-center gap-2 whitespace-nowrap bg-gm-blue-ink hover:bg-gm-navy"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-5 w-5" />
        Add location
      </Button>
      {open ? <AddLocationDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
