"use client";

import Image from "next/image";
import type { Product } from "@/src/lib/types";

interface InventoryProductCardProps {
  onClick?: (product: Product) => void;
  product: Product;
}

export function InventoryProductCard({
  product,
  onClick,
}: InventoryProductCardProps) {
  return (
    <button
      className="flex aspect-square min-h-[100px] touch-manipulation flex-col items-center justify-center rounded-xl bg-gradient-to-b from-[#5B9BD5] to-[#3A6BA8] p-3 transition-all hover:from-[#4A8BC5] hover:to-[#2A5B98] active:from-[#3A7BB5] active:to-[#1A4B88] sm:p-4"
      onClick={() => onClick?.(product)}
      type="button"
    >
      <div className="flex flex-1 items-center justify-center">
        <Image
          alt={product.name}
          className="max-h-20 object-contain sm:max-h-24"
          height={100}
          src={product.image}
          width={80}
        />
      </div>
      <span className="mt-2 line-clamp-2 text-center font-bold text-white text-xs uppercase tracking-wide sm:text-sm">
        {product.name}
      </span>
    </button>
  );
}
