import { ResponseError } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { getAlertByIdentifier } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Alert" };
export const dynamic = "force-dynamic";

export default async function DeskAlertByIdentifierPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const gate = await requireDeskGate(
    `/desk/alerts/by-identifier/${encodeURIComponent(identifier)}`
  );
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;

  let alert: Awaited<ReturnType<typeof getAlertByIdentifier>>;
  try {
    alert = await getAlertByIdentifier(gate.accessToken, identifier);
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.status === 404) notFound();
      if (error.status === 403) return <DeskRefused email={gate.email} />;
    }
    reportError(error, "cap-desk-alert-by-identifier");
    return <DeskUnavailable what="This alert" />;
  }
  redirect(`/desk/alerts/${alert.id}`);
}
