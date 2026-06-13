"use client";

import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InventoryProductCard } from "@/components/inventory";
import { Button, SearchBar } from "@/components/ui";
import { categories, getProductsByCategory } from "@/lib/mock-data";

export default function CategoryDetailPage() {
  const params = useParams();
  const categoryId = params.category as string;
  const [searchQuery, setSearchQuery] = useState("");

  const category = categories.find((c) => c.id === categoryId);
  const products = getProductsByCategory(categoryId);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group products by category for the section header
  const categoryGroups = new Map<string, typeof products>();
  for (const product of filteredProducts) {
    const existing = categoryGroups.get(product.category) ?? [];
    existing.push(product);
    categoryGroups.set(product.category, existing);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      {/* Header with search and add button */}
      <div className="flex gap-3">
        <SearchBar
          className="flex-1"
          onSearch={setSearchQuery}
          placeholder="Search items..."
          value={searchQuery}
        />
        <Button className="flex items-center gap-2 whitespace-nowrap bg-gm-blue hover:bg-gm-navy">
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Add Item</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Category sections */}
      {Array.from(categoryGroups.entries()).map(([catId, catProducts]) => (
        <div key={catId}>
          {/* Section header with line */}
          <div className="mb-4 flex items-center gap-3">
            <span className="text-muted-foreground text-sm lowercase sm:text-base">
              {category?.name ?? catId}
            </span>
            <div className="h-px flex-1 bg-gray-300" />
          </div>

          {/* Product grid - responsive columns */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 landscape:grid-cols-5">
            {catProducts.map((product) => (
              <InventoryProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      ))}

      {filteredProducts.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-base sm:text-lg">No products found</p>
        </div>
      )}
    </div>
  );
}
