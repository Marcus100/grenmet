import { ChevronRight, Package } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export interface CategorySummary {
  itemCount: number;
  name: string;
  onHand: number;
}

export function CategoryCard({ category }: { category: CategorySummary }) {
  return (
    <Link
      className="bg-card hover:shadow-card active:bg-muted flex min-h-16 touch-manipulation items-center gap-4 rounded-xl p-3 transition-all sm:p-4"
      href={`/salesbus/inventory/${encodeURIComponent(category.name)}` as Route}
    >
      <div className="bg-muted text-muted-foreground flex h-20 w-28 flex-shrink-0 items-center justify-center rounded-lg sm:h-24 sm:w-32">
        <Package className="h-8 w-8" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-foreground truncate text-lg font-bold sm:text-xl">
          {category.name}
        </h3>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm sm:text-base">
          {category.itemCount} {category.itemCount === 1 ? "item" : "items"} •{" "}
          {category.onHand} in stock
        </p>
      </div>

      <ChevronRight className="text-muted-foreground h-6 w-6 flex-shrink-0" />
    </Link>
  );
}
