import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoAccess } from "@/components/salesbus/NoAccess";
import { DraftEditor } from "@/components/salesbus/sales/DraftEditor";
import {
  getCatalogue,
  getRequisition,
  getStoresAccessOrNull,
} from "@/db/stores/queries";

export const metadata: Metadata = { title: "Edit draft requisition" };

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const { id } = await params;
  const requisition = await getRequisition(id);
  if (!requisition) notFound();
  // Only the requester's own draft can be edited; anything else goes back.
  if (!requisition.can_edit) redirect("/salesbus/sales");

  const items = await getCatalogue({ activeOnly: true });
  return <DraftEditor items={items} requisition={requisition} />;
}
