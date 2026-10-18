"use client";

import type { ItemPublic } from "@barrelsgd/api-client";
import { ShoppingCart } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ItemCard } from "@/components/salesbus/sales";
import { ItemDetailModal } from "@/components/salesbus/sales/ItemDetailModal";
import { SearchBar } from "@/components/salesbus/ui";
import { useCart } from "@/lib/salesbus/cart-store";

export function RequisitionBuilder({ items }: { items: ItemPublic[] }) {
  const { totalItems } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<ItemPublic | null>(null);

  const query = searchQuery.toLowerCase();
  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex gap-3">
        <SearchBar
          className="flex-1"
          onSearch={setSearchQuery}
          placeholder="Search items..."
          value={searchQuery}
        />
        <Link
          className="relative flex min-h-12 touch-manipulation items-center gap-2 rounded-lg bg-gm-blue-ink px-4 font-medium text-white hover:bg-gm-navy"
          href={"/salesbus/sales/cart" as Route}
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="hidden sm:inline">Review</span>
          <span className="tabular-nums">({totalItems})</span>
        </Link>
      </div>

      {/* Item list - single column on mobile, 2 columns on tablet landscape */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 landscape:grid-cols-2">
        {filtered.map((item) => (
          <ItemCard item={item} key={item.id} onAdd={setSelected} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-base sm:text-lg">
            No items found matching &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      <ItemDetailModal
        isOpen={selected !== null}
        item={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
