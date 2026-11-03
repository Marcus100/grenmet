import type { Metadata } from "next";
import {
  CategoryCard,
  type CategorySummary,
  LocationsButton,
} from "@/components/salesbus/inventory";
import { NoAccess } from "@/components/salesbus/NoAccess";
import { getCatalogue, getStoresAccessOrNull } from "@/db/stores/queries";

export const metadata: Metadata = { title: "Stores inventory" };

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const items = await getCatalogue();
  const byCategory = new Map<string, CategorySummary>();
  for (const item of items) {
    const summary = byCategory.get(item.category) ?? {
      name: item.category,
      itemCount: 0,
      onHand: 0,
    };
    summary.itemCount += 1;
    summary.onHand += item.on_hand;
    byCategory.set(item.category, summary);
  }
  const categories = [...byCategory.values()];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-5">
      {access.can_manage ? (
        <div className="flex justify-end">
          <LocationsButton />
        </div>
      ) : null}
      {/* Category list - 2 columns on tablet landscape */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 landscape:grid-cols-2">
        {categories.map((category) => (
          <CategoryCard category={category} key={category.name} />
        ))}
      </div>
      {categories.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-base sm:text-lg">
          The catalogue is empty.
        </p>
      )}
    </div>
  );
}
