"use client";

import type { ItemPublic } from "@barrelsgd/api-client";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal, QuantitySelector } from "@/components/salesbus/ui";
import { useCart } from "@/lib/salesbus/cart-store";

interface ItemDetailModalProps {
  isOpen: boolean;
  item: ItemPublic | null;
  onClose: () => void;
}

export function ItemDetailModal({
  item,
  isOpen,
  onClose,
}: ItemDetailModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  // Reset state when the modal opens for a new item
  useEffect(() => {
    if (isOpen) setQuantity(1);
  }, [isOpen]);

  if (!item) return null;

  const handleAddToRequisition = () => {
    addItem(
      {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
      },
      quantity
    );
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 sm:gap-6">
        <div className="flex gap-4 sm:gap-5">
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:h-28 sm:w-28">
            <Package className="h-10 w-10" />
          </div>

          <div className="flex-1">
            <h2 className="font-bold text-foreground text-xl tracking-wide sm:text-2xl">
              {item.name}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm sm:text-base">
              {item.sku} • {item.category}
            </p>
            <p className="mt-1 text-muted-foreground text-sm sm:text-base">
              {item.on_hand} {item.unit} in stock
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-semibold text-base text-foreground sm:text-lg">
            Quantity ({item.unit})
          </span>
          <QuantitySelector
            max={10_000}
            onChange={setQuantity}
            value={quantity}
          />
        </div>

        <Button
          className="w-full bg-gm-blue-ink hover:bg-gm-navy"
          onClick={handleAddToRequisition}
          size="touch"
        >
          ADD TO REQUISITION
        </Button>
      </div>
    </Modal>
  );
}
