"use client";

import type { ItemPublic, RequisitionPublic } from "@barrelsgd/api-client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  cancelRequisition,
  errorMessage,
  submitRequisition,
  updateRequisition,
} from "@/components/salesbus/api";
import { CartItemCard } from "@/components/salesbus/sales/CartItem";
import { Button } from "@/components/salesbus/ui";
import type { CartItem } from "@/lib/salesbus/types";

type Action = "save" | "submit" | "discard";

const BACK = "/salesbus/sales";

function toLines(requisition: RequisitionPublic): CartItem[] {
  return requisition.lines.map((line) => ({
    itemId: line.item_id,
    name: line.item_name,
    quantity: line.requested_quantity,
    sku: line.sku,
    unit: line.unit,
  }));
}

export function DraftEditor({
  items,
  requisition,
}: {
  items: ItemPublic[];
  requisition: RequisitionPublic;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState(requisition.purpose ?? "");
  const [neededBy, setNeededBy] = useState(requisition.needed_by ?? "");
  const [lines, setLines] = useState<CartItem[]>(() => toLines(requisition));
  const [toAdd, setToAdd] = useState("");

  const run = useMutation({
    mutationFn: async (action: Action) => {
      if (action === "discard") {
        await cancelRequisition(requisition.id);
        return;
      }
      await updateRequisition(requisition.id, {
        purpose: purpose.trim() || null,
        needed_by: neededBy || null,
        lines: lines.map((line) => ({
          item_id: line.itemId,
          quantity: line.quantity,
        })),
      });
      if (action === "submit") await submitRequisition(requisition.id);
    },
  });

  async function act(action: Action, success: string) {
    try {
      await run.mutateAsync(action);
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not update the requisition"));
      return;
    }
    toast.success(success);
    router.push(BACK);
    router.refresh();
  }

  const available = items.filter(
    (item) => !lines.some((line) => line.itemId === item.id)
  );

  function addSelected() {
    const item = available.find((entry) => entry.id === toAdd);
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        itemId: item.id,
        name: item.name,
        quantity: 1,
        sku: item.sku,
        unit: item.unit,
      },
    ]);
    setToAdd("");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      <PageHeader title={`Edit draft ${requisition.reference}`} />

      <div className="bg-card flex flex-col gap-3 rounded-xl p-4 sm:p-5">
        <p className="text-sm" data-testid="requisition-department">
          <span className="text-foreground font-medium">Requesting for: </span>
          {requisition.department_name}{" "}
          <span className="text-muted-foreground text-xs">
            (requested by {requisition.requester_name})
          </span>
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground font-medium">
            What is it for? (optional)
          </span>
          <input
            className="border-input bg-background min-h-12 rounded-lg border px-3 text-base"
            maxLength={500}
            onChange={(e) => setPurpose(e.target.value)}
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
        {lines.map((line) => (
          <CartItemCard
            item={line}
            key={line.itemId}
            onQuantityChange={(itemId, quantity) =>
              setLines((prev) =>
                prev.map((entry) =>
                  entry.itemId === itemId ? { ...entry, quantity } : entry
                )
              )
            }
            onRemove={(itemId) =>
              setLines((prev) =>
                prev.filter((entry) => entry.itemId !== itemId)
              )
            }
          />
        ))}
        {lines.length === 0 && (
          <p className="text-muted-foreground py-6 text-center">
            Add at least one item to keep or submit this draft
          </p>
        )}
      </div>

      <div className="bg-card flex gap-3 rounded-xl p-4 sm:p-5">
        <select
          aria-label="Add an item"
          className="border-input bg-background min-h-12 flex-1 rounded-lg border px-3 text-base"
          onChange={(e) => setToAdd(e.target.value)}
          value={toAdd}
        >
          <option value="">Add an item…</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.sku})
            </option>
          ))}
        </select>
        <Button
          disabled={!toAdd}
          onClick={addSelected}
          size="touch"
          variant="outline"
        >
          Add
        </Button>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          disabled={run.isPending}
          onClick={() => act("discard", "Draft discarded")}
          size="touch"
          variant="outline"
        >
          Discard draft
        </Button>
        <Button
          disabled={lines.length === 0 || run.isPending}
          onClick={() => act("save", "Draft saved")}
          size="touch"
          variant="outline"
        >
          Save draft
        </Button>
        <Button
          className="bg-gm-blue-ink hover:bg-gm-navy"
          disabled={lines.length === 0 || run.isPending}
          onClick={() => act("submit", "Requisition submitted for approval")}
          size="touch"
        >
          Submit for approval
        </Button>
      </div>
    </div>
  );
}
