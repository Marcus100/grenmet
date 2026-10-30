"use client";

import { Package, Trash2 } from "lucide-react";
import { QuantitySelector } from "@/components/salesbus/ui";
import type { CartItem as CartItemType } from "@/lib/salesbus/types";

interface CartItemProps {
  item: CartItemType;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

export function CartItemCard({
  item,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl p-4 sm:p-5">
      <div className="bg-muted text-muted-foreground flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg sm:h-20 sm:w-20">
        <Package className="h-7 w-7" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-foreground truncate text-base font-bold tracking-wide sm:text-lg">
          {item.name}
        </h3>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {item.sku} • {item.unit}
        </p>
      </div>

      <QuantitySelector
        max={10_000}
        onChange={(quantity) => onQuantityChange(item.itemId, quantity)}
        value={item.quantity}
      />

      <button
        aria-label={`Remove ${item.name}`}
        className="text-muted-foreground hover:bg-muted hover:text-destructive flex h-12 w-12 flex-shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors"
        onClick={() => onRemove(item.itemId)}
        type="button"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}
