import type { Metadata } from "next";
import { CategoryInventory } from "@/components/salesbus/inventory";
import { NoAccess } from "@/components/salesbus/NoAccess";
import {
  getCatalogue,
  getLocations,
  getStoresAccessOrNull,
} from "@/db/stores/queries";

export const metadata: Metadata = { title: "Stores inventory" };

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: encoded } = await params;
  const category = decodeURIComponent(encoded);
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const [catalogue, locations] = await Promise.all([
    getCatalogue(),
    access.can_manage ? getLocations() : Promise.resolve([]),
  ]);
  const categories = [...new Set(catalogue.map((item) => item.category))];

  return (
    <CategoryInventory
      canManage={access.can_manage}
      categories={categories}
      category={category}
      items={catalogue.filter((item) => item.category === category)}
      locations={locations}
    />
  );
}
