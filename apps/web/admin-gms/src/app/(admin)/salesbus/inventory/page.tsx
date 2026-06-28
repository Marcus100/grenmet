"use client";

import { CategoryCard } from "@/components/salesbus/inventory";
import { categories } from "@/lib/salesbus/mock-data";

export default function InventoryPage() {
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-5">
      {/* Category list - 2 columns on tablet landscape */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 landscape:grid-cols-2">
        {categories.map((category) => (
          <CategoryCard category={category} key={category.id} />
        ))}
      </div>
    </div>
  );
}
