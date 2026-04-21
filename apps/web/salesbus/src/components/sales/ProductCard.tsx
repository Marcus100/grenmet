"use client";

import Image from "next/image";
import { Button } from "@/components/ui";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/types";

interface ProductCardProps {
  onAdd: (product: Product) => void;
  product: Product;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  return (
    <div className="flex gap-4 rounded-xl bg-[var(--color-surface)] p-4 sm:p-5">
      <div className="flex h-28 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 sm:h-32 sm:w-28">
        <Image
          alt={product.name}
          className="object-contain"
          height={120}
          src={product.image}
          width={100}
        />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--color-text-primary)] text-lg tracking-wide sm:text-xl">
            {product.name}
          </h3>
          <p className="mt-1 text-[var(--color-text-secondary)] text-sm sm:text-base">
            {formatPrice(product.halfCasePrice)} half case •{" "}
            {formatPrice(product.fullCasePrice)} full case
          </p>
        </div>

        <Button
          fullWidth
          onClick={() => onAdd(product)}
          size="md"
          variant="primary"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
