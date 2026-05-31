"use client";

import Image from "next/image";
import type { CartItem as CartItemType } from "@/lib/types";
import { formatCaseType, formatPrice } from "@/lib/types";

interface CartItemProps {
  item: CartItemType;
}

export function CartItemCard({ item }: CartItemProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-card p-4 sm:p-5">
      <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 sm:h-24 sm:w-20">
        <Image
          alt={item.product.name}
          className="object-contain"
          height={90}
          src={item.product.image}
          width={70}
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold text-base text-foreground tracking-wide sm:text-lg">
          {item.product.name}
        </h3>
        <p className="mt-1 text-muted-foreground text-sm sm:text-base">
          {item.quantity} {formatCaseType(item.caseType)}
        </p>
      </div>

      <span className="flex-shrink-0 font-bold text-foreground text-lg sm:text-xl">
        {formatPrice(item.price)}
      </span>
    </div>
  );
}
