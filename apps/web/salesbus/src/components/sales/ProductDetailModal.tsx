"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Button,
  Modal,
  QuantitySelector,
  SegmentedControl,
} from "@/components/ui";
import { useCart } from "@/lib/cart-store";
import type { CaseType, Product } from "@/lib/types";
import { formatPrice, getCasePrice } from "@/lib/types";

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

const caseTypeOptions = [
  { value: "full", label: "Full Case" },
  { value: "3/4", label: "3/4 Case" },
  { value: "1/2", label: "1/2 Case" },
  { value: "1/4", label: "1/4 Case" },
];

export function ProductDetailModal({
  product,
  isOpen,
  onClose,
}: ProductDetailModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [caseType, setCaseType] = useState<CaseType>("full");

  // Reset state when modal opens with new product
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setCaseType("full");
    }
  }, [isOpen]);

  if (!product) return null;

  const unitPrice = getCasePrice(product, caseType);
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    addItem(product, quantity, caseType);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 sm:gap-6">
        {/* Product Info */}
        <div className="flex gap-4 sm:gap-5">
          <div className="flex h-32 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 sm:h-36 sm:w-32">
            <Image
              alt={product.name}
              className="object-contain"
              height={140}
              src={product.image}
              width={120}
            />
          </div>

          <div className="flex-1">
            <h2 className="font-bold text-foreground text-xl tracking-wide sm:text-2xl">
              {product.name}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm sm:text-base">
              {formatPrice(product.halfCasePrice)} half case •{" "}
              {formatPrice(product.fullCasePrice)} full case
            </p>

            {/* Price and Quantity */}
            <div className="mt-4 flex items-center justify-between sm:mt-5">
              <span className="font-bold text-2xl text-gm-blue sm:text-3xl">
                {formatPrice(totalPrice)}
              </span>
              <QuantitySelector onChange={setQuantity} value={quantity} />
            </div>
          </div>
        </div>

        {/* Case Type Selector */}
        <div>
          <h3 className="mb-3 font-semibold text-base text-foreground sm:text-lg">
            Type
          </h3>
          <SegmentedControl
            onChange={(value) => setCaseType(value as CaseType)}
            options={caseTypeOptions}
            value={caseType}
            variant="pill"
          />
        </div>

        {/* Add to Cart Button */}
        <Button
          className="w-full bg-gm-blue hover:bg-gm-navy"
          onClick={handleAddToCart}
          size="touch"
        >
          ADD TO CART
        </Button>
      </div>
    </Modal>
  );
}
