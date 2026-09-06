"use client";

import { useRouter } from "next/navigation";
import { CartItemCard } from "@/components/salesbus/sales/CartItem";
import { Button, SegmentedControl } from "@/components/salesbus/ui";
import { useIsTabletLandscape } from "@/hooks/salesbus";
import { useCart } from "@/lib/salesbus/cart-store";
import { formatPrice } from "@/lib/salesbus/types";

const paymentOptions = [
  { value: "cash", label: "CASH" },
  { value: "credit", label: "CREDIT" },
];

export default function CartPage() {
  const router = useRouter();
  const isTabletLandscape = useIsTabletLandscape();
  const { items, paymentType, setPaymentType, totalPrice, clearCart } =
    useCart();

  const handleDone = () => {
    // In a real app, this would submit the order
    clearCart();
    router.push("/salesbus/sales");
  };

  return (
    <div
      className={`flex flex-col ${isTabletLandscape ? "min-h-[calc(100vh-5rem)]" : "min-h-[calc(100vh-8rem)]"}`}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-5">
        <SegmentedControl
          onChange={(value) => setPaymentType(value as "cash" | "credit")}
          options={paymentOptions}
          value={paymentType}
        />

        <div className="flex flex-col gap-3 sm:gap-4">
          {items.map((item) => (
            <CartItemCard item={item} key={item.id} />
          ))}
        </div>

        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-base text-muted-foreground sm:text-lg">
              Your cart is empty
            </p>
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div
        className={`sticky ${isTabletLandscape ? "bottom-4" : "bottom-20"} mx-auto w-full max-w-3xl p-4 sm:p-5`}
      >
        <Button
          className="flex w-full justify-between bg-gm-blue hover:bg-gm-navy"
          disabled={items.length === 0}
          onClick={handleDone}
          size="touch"
        >
          <span className="text-base sm:text-lg">DONE</span>
          <span className="text-base sm:text-lg">
            {formatPrice(totalPrice)}
          </span>
        </Button>
      </div>
    </div>
  );
}
