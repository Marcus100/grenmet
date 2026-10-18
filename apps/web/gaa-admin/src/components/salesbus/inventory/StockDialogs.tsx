"use client";

import type { ItemPublic, LocationPublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  createItem,
  createLocation,
  errorMessage,
  recordStockMovement,
} from "../api";

function useSave(onClose: () => void, success: string, failure: string) {
  const router = useRouter();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
  });
  async function save(run: () => Promise<unknown>) {
    setError("");
    try {
      await mutation.mutateAsync(run);
      toast.success(success);
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, failure));
    }
  }
  return { error, pending: mutation.isPending, save };
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  ) : null;
}

export function AddItemDialog({
  categories,
  defaultCategory,
  onClose,
}: {
  categories: string[];
  defaultCategory: string;
  onClose: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: defaultCategory,
    unit: "each",
  });
  const { error, pending, save } = useSave(
    onClose,
    "Item added",
    "Could not add the item"
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save(() => createItem(form));
          }}
        >
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>
              New items start with no stock; record a receipt to add some.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              id={`${id}-name`}
              maxLength={200}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              value={form.name}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor={`${id}-sku`}>SKU</FieldLabel>
              <Input
                id={`${id}-sku`}
                maxLength={60}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                required
                value={form.sku}
              />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor={`${id}-unit`}>Unit</FieldLabel>
              <Input
                id={`${id}-unit`}
                maxLength={30}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                required
                value={form.unit}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`${id}-category`}>Category</FieldLabel>
            <Input
              id={`${id}-category`}
              list={`${id}-categories`}
              maxLength={100}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
              value={form.category}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={pending} type="submit">
              Add item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MOVEMENTS = [
  { value: "RECEIPT", label: "Receive stock" },
  { value: "ISSUE", label: "Issue (write off)" },
  { value: "ADJUSTMENT", label: "Stock count (set level)" },
] as const;

export function StockDialog({
  item,
  locations,
  onClose,
}: {
  item: ItemPublic;
  locations: LocationPublic[];
  onClose: () => void;
}) {
  const id = useId();
  const active = locations.filter((location) => location.is_active);
  const [form, setForm] = useState({
    kind: "RECEIPT" as (typeof MOVEMENTS)[number]["value"],
    location_id: active[0]?.id ?? "",
    quantity: "",
    reason: "",
  });
  const { error, pending, save } = useSave(
    onClose,
    "Stock updated",
    "Could not update the stock"
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save(() =>
              recordStockMovement({
                item_id: item.id,
                kind: form.kind,
                location_id: form.location_id,
                quantity: Number(form.quantity),
                reason: form.reason.trim() || null,
              })
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{item.name}</DialogTitle>
            <DialogDescription>
              {item.sku} • {item.on_hand} {item.unit} in stock
            </DialogDescription>
          </DialogHeader>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Add a store location first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Field>
                  <FieldLabel htmlFor={`${id}-kind`}>Action</FieldLabel>
                  <NativeSelect
                    id={`${id}-kind`}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        kind: e.target.value as typeof form.kind,
                      })
                    }
                    value={form.kind}
                  >
                    {MOVEMENTS.map((movement) => (
                      <NativeSelectOption
                        key={movement.value}
                        value={movement.value}
                      >
                        {movement.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-location`}>Location</FieldLabel>
                  <NativeSelect
                    id={`${id}-location`}
                    onChange={(e) =>
                      setForm({ ...form, location_id: e.target.value })
                    }
                    value={form.location_id}
                  >
                    {active.map((location) => (
                      <NativeSelectOption key={location.id} value={location.id}>
                        {location.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field className="w-32">
                  <FieldLabel htmlFor={`${id}-quantity`}>
                    {form.kind === "ADJUSTMENT" ? "Counted" : "Quantity"}
                  </FieldLabel>
                  <Input
                    id={`${id}-quantity`}
                    inputMode="numeric"
                    max={1_000_000}
                    min={0}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                    required
                    type="number"
                    value={form.quantity}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`${id}-reason`}>
                  Reason{form.kind === "RECEIPT" ? " (optional)" : ""}
                </FieldLabel>
                <Input
                  id={`${id}-reason`}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. Delivery note 4411, annual stock count"
                  required={form.kind !== "RECEIPT"}
                  value={form.reason}
                />
              </Field>
            </>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={pending || active.length === 0} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddLocationDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [form, setForm] = useState({ code: "", name: "" });
  const { error, pending, save } = useSave(
    onClose,
    "Store location added",
    "Could not add the location"
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save(() => createLocation(form));
          }}
        >
          <DialogHeader>
            <DialogTitle>Add store location</DialogTitle>
            <DialogDescription>
              A store room that holds stock, such as the main store.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              id={`${id}-name`}
              maxLength={150}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              value={form.name}
            />
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor={`${id}-code`}>Code</FieldLabel>
            <Input
              id={`${id}-code`}
              maxLength={40}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              value={form.code}
            />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={pending} type="submit">
              Add location
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
