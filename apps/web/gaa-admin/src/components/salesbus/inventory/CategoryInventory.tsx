"use client";

import type { ItemPublic, LocationPublic } from "@barrelsgd/api-client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, SearchBar } from "@/components/salesbus/ui";
import { InventoryProductCard } from "./InventoryProductCard";
import { AddItemDialog, StockDialog } from "./StockDialogs";

interface CategoryInventoryProps {
  canManage: boolean;
  categories: string[];
  category: string;
  items: ItemPublic[];
  locations: LocationPublic[];
}

export function CategoryInventory({
  canManage,
  categories,
  category,
  items,
  locations,
}: CategoryInventoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [stocking, setStocking] = useState<ItemPublic | null>(null);

  const filtered = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      <div className="flex gap-3">
        <SearchBar
          className="flex-1"
          onSearch={setSearchQuery}
          placeholder="Search items..."
          value={searchQuery}
        />
        {canManage ? (
          <Button
            className="bg-gm-blue-ink hover:bg-gm-navy flex items-center gap-2 whitespace-nowrap"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Add Item</span>
            <span className="sm:hidden">Add</span>
          </Button>
        ) : null}
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-muted-foreground text-sm lowercase sm:text-base">
            {category}
          </span>
          <div className="bg-border h-px flex-1" />
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 landscape:grid-cols-5">
          {filtered.map((item) => (
            <InventoryProductCard
              item={item}
              key={item.id}
              onClick={canManage ? setStocking : undefined}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-muted-foreground py-12 text-center">
          <p className="text-base sm:text-lg">No items found</p>
        </div>
      )}

      {adding ? (
        <AddItemDialog
          categories={categories}
          defaultCategory={category}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {stocking ? (
        <StockDialog
          item={stocking}
          locations={locations}
          onClose={() => setStocking(null)}
        />
      ) : null}
    </div>
  );
}
