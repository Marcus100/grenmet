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
    <div className="bg-card flex gap-4 rounded-xl p-4 sm:p-5">
      <div className="bg-muted text-muted-foreground flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg sm:h-24 sm:w-24">
        <Package className="h-8 w-8" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3">
        <div>
          <h3 className="text-foreground text-lg font-bold tracking-wide sm:text-xl">
            {item.name}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {item.sku} • {item.category} • {item.on_hand} {item.unit} in stock
          </p>
        </div>

        <Button
          className="bg-gm-blue-ink hover:bg-gm-navy w-full"
          onClick={() => onAdd(item)}
          size="touch"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
