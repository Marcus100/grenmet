"use client";

import type { ItemPublic } from "@barrelsgd/api-client";
import { Package } from "lucide-react";
import { Button } from "@/components/salesbus/ui";

interface ItemCardProps {
  item: ItemPublic;
  onAdd: (item: ItemPublic) => void;
}

export function ItemCard({ item, onAdd }: ItemCardProps) {
  return (
    <div className="flex gap-4 rounded-xl bg-card p-4 sm:p-5">
      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:h-24 sm:w-24">
        <Package className="h-8 w-8" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground text-lg tracking-wide sm:text-xl">
            {item.name}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm sm:text-base">
            {item.sku} • {item.category} • {item.on_hand} {item.unit} in stock
          </p>
        </div>

        <Button
          className="w-full bg-gm-blue-ink hover:bg-gm-navy"
          onClick={() => onAdd(item)}
          size="touch"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
