"use client";

import Image from "next/image";
import type { Product } from "@/lib/types";

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
      className="flex aspect-square min-h-[100px] touch-manipulation flex-col items-center justify-center rounded-xl bg-gradient-to-b from-gm-blue to-gm-navy p-3 transition-all hover:from-gm-sky hover:to-gm-blue active:from-gm-blue active:to-gm-navy sm:p-4"
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
