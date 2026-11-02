"use client";

import { useHrGetHrProfileMe } from "@barrelsgd/api-client";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createRequisition, errorMessage } from "@/components/salesbus/api";
import { CartItemCard } from "@/components/salesbus/sales/CartItem";
import { Button } from "@/components/salesbus/ui";
import { useIsTabletLandscape } from "@/hooks/salesbus";
import { useCart } from "@/lib/salesbus/cart-store";

export default function CartPage() {
  const router = useRouter();
  const isTabletLandscape = useIsTabletLandscape();
  const { items, clearCart, removeItem, updateItemQuantity, totalItems } =
    useCart();
  const department =
    useHrGetHrProfileMe().data?.employment?.department?.name ?? "";
  const [purpose, setPurpose] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const submit = useMutation({
    mutationFn: (asDraft: boolean) =>
      createRequisition({
        purpose: purpose.trim() || null,
        needed_by: neededBy || null,
        lines: items.map((item) => ({
          item_id: item.itemId,
          quantity: item.quantity,
        })),
        submit: !asDraft,
      }),
  });

  const handleDone = async (asDraft: boolean) => {
    try {
      await submit.mutateAsync(asDraft);
    } catch (caught) {
      toast.error(
        errorMessage(
          caught,
          asDraft
            ? "Could not save the draft"
            : "Could not submit the requisition"
        )
      );
      return;
    }
    toast.success(
      asDraft
        ? "Draft saved. Find it under Your drafts"
        : "Requisition submitted for approval"
    );
    clearCart();
    router.push("/salesbus/sales");
    router.refresh();
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        isTabletLandscape
          ? "min-h-[calc(100vh-5rem)]"
          : "min-h-[calc(100vh-8rem)]"
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="bg-card flex flex-col gap-3 rounded-xl p-4 sm:p-5">
          {department ? (
            <p className="text-sm" data-testid="requisition-department">
              <span className="text-foreground font-medium">
                Requesting for:{" "}
              </span>
              {department}{" "}
              <span className="text-muted-foreground text-xs">
                (from your staff profile)
              </span>
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground font-medium">
              What is it for? (optional)
            </span>
            <input
              className="border-input bg-background min-h-12 rounded-lg border px-3 text-base"
              maxLength={500}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Office supplies for the October roster"
              value={purpose}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground font-medium">
              Needed by (optional)
            </span>
            <input
              className="border-input bg-background min-h-12 rounded-lg border px-3 text-base"
              onChange={(e) => setNeededBy(e.target.value)}
              type="date"
              value={neededBy}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4">
          {items.map((item) => (
            <CartItemCard
              item={item}
              key={item.itemId}
              onQuantityChange={updateItemQuantity}
              onRemove={removeItem}
            />
          ))}
        </div>

        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground text-base sm:text-lg">
              Your requisition is empty
            </p>
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div
        className={cn(
          "sticky mx-auto w-full max-w-3xl p-4 sm:p-5",
          isTabletLandscape ? "bottom-4" : "bottom-20"
        )}
      >
        <Button
          className="mb-3 flex w-full justify-center"
          disabled={items.length === 0 || submit.isPending}
          onClick={() => handleDone(true)}
          size="touch"
          variant="outline"
        >
          <span className="text-base sm:text-lg">SAVE AS DRAFT</span>
        </Button>
        <Button
          className="bg-gm-blue-ink hover:bg-gm-navy flex w-full justify-between"
          disabled={items.length === 0 || submit.isPending}
          onClick={() => handleDone(false)}
          size="touch"
        >
          <span className="text-base sm:text-lg">SUBMIT FOR APPROVAL</span>
          <span className="text-base sm:text-lg">{totalItems} units</span>
        </Button>
      </div>
    </div>
  );
}
