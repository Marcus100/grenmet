import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@grenmet/ui/components/ui/button";
import { Input } from "@grenmet/ui/components/ui/input";
import { cn, formatCurrency } from "@grenmet/ui/lib/utils";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { UseFormRegister } from "react-hook-form";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import {
  getLineAmount,
  type InvoiceFormValues,
  type InvoiceLineItem,
} from "./data";

export function InvoiceItems() {
  const { control, register } = useFormContext<InvoiceFormValues>();
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: "items",
    keyName: "fieldKey",
  });
  const items = useWatch({ control, name: "items" }) ?? [];
  const sortableItemIds = fields.map((field) => field.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((field) => field.id === active.id);
    const newIndex = fields.findIndex((field) => field.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    move(oldIndex, newIndex);
  }

  function handleAddItem() {
    append({
      id: `item-${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium tracking-tight">Invoice Items</h2>
        <Button onClick={handleAddItem} size="sm" type="button" variant="ghost">
          <Plus data-icon="inline-start" />
          Add Item
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="hidden items-center gap-2 px-1 font-medium text-muted-foreground text-xs md:grid md:grid-cols-[24px_minmax(0,1fr)_64px_112px_112px_32px]">
          <span />
          <span>Description</span>
          <span className="px-2">Units</span>
          <span className="px-2">Unit cost</span>
          <span className="text-right">Line Total</span>
          <span />
        </div>

        <DndContext
          collisionDetection={closestCenter}
          id="invoice-items"
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext
            items={sortableItemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <SortableInvoiceItemRow
                  id={field.id}
                  index={index}
                  item={items[index]}
                  key={field.id}
                  onRemove={() => remove(index)}
                  register={register}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}

function SortableInvoiceItemRow({
  id,
  index,
  item,
  register,
  onRemove,
}: {
  id: string;
  index: number;
  item?: InvoiceLineItem;
  register: UseFormRegister<InvoiceFormValues>;
  onRemove: () => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
  });

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[24px_minmax(0,0.8fr)_minmax(0,1fr)_32px] items-center gap-2 rounded-lg md:grid-cols-[24px_minmax(0,1fr)_64px_112px_112px_32px]",
        isDragging && "relative z-10 opacity-50"
      )}
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      <Button
        aria-label={`Reorder ${id}`}
        className="-ml-2 cursor-grab text-muted-foreground active:cursor-grabbing"
        ref={setActivatorNodeRef}
        size="icon-sm"
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <Input
        aria-label={`Item ${index + 1} description`}
        className="min-w-0 text-sm max-md:col-span-3"
        {...register(`items.${index}.description` as const)}
      />
      <Input
        aria-label={`Item ${index + 1} quantity`}
        className="text-sm max-md:col-start-2 max-md:row-start-2"
        step="1"
        type="number"
        {...register(`items.${index}.quantity` as const, {
          valueAsNumber: true,
        })}
      />
      <Input
        aria-label={`Item ${index + 1} unit price`}
        className="text-sm max-md:col-start-3 max-md:row-start-2"
        step="0.01"
        type="number"
        {...register(`items.${index}.unitPrice` as const, {
          valueAsNumber: true,
        })}
      />
      <div className="min-w-0 text-right font-medium text-sm max-md:col-span-3 max-md:col-start-2 max-md:row-start-3 max-md:flex max-md:items-center max-md:justify-between max-md:text-left">
        <span className="hidden text-muted-foreground max-md:inline">
          Line total
        </span>
        <span>{formatInvoiceCurrency(getLineAmount(item))}</span>
      </div>
      <Button
        aria-label={`Remove item ${index + 1}`}
        className="max-md:col-start-4 max-md:row-start-2"
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function formatInvoiceCurrency(value: number) {
  return formatCurrency(Number.isFinite(value) ? value : 0, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
