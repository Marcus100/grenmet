"use client";

import type { ItemPublic } from "@barrelsgd/api-client";
import { Package } from "lucide-react";

interface InventoryProductCardProps {
  item: ItemPublic;
  onClick?: (item: ItemPublic) => void;
}

export function InventoryProductCard({
  item,
  onClick,
}: InventoryProductCardProps) {
  return (
    <button
      className="from-gm-blue to-gm-navy hover:from-gm-sky hover:to-gm-blue active:from-gm-blue active:to-gm-navy flex aspect-square min-h-[100px] touch-manipulation flex-col items-center justify-center rounded-xl bg-gradient-to-b p-3 transition-all disabled:cursor-default sm:p-4"
      disabled={!onClick}
      onClick={() => onClick?.(item)}
      type="button"
    >
      <div className="flex flex-1 items-center justify-center text-white/80">
        <Package className="h-10 w-10" />
      </div>
      <span className="mt-2 line-clamp-2 text-center text-xs font-bold tracking-wide text-white uppercase sm:text-sm">
        {item.name}
      </span>
      <span className="mt-1 text-xs text-white/80">
        {item.on_hand} {item.unit}
        {item.is_active ? "" : " • retired"}
      </span>
    </button>
  );
}
