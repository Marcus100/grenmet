import type { Metadata } from "next";
import { StaffOnly } from "@/components/staff-only";
import { StatusCard } from "@/components/status-card";
import { listOrganisations } from "@/lib/api";
import { getAuthConfig } from "@/lib/auth-config";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";
import {
  mapLiveness,
  mapReadiness,
  organisationsCard,
  probeApi,
  releaseCard,
  workerCard,
} from "@/lib/status";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function apiUrl(path: string): string {
  const { authApiBaseUrl, authApiPrefix } = getAuthConfig();
  return `${authApiBaseUrl}${authApiPrefix}${path}`;
}

async function organisationCount(accessToken: string): Promise<number | null> {
  try {
    const list = await listOrganisations(accessToken, { page: 1 });
    return list.count;
  } catch (error) {
    reportError(error, "overview-organisations");
    return null;
  }
}

export default async function OverviewPage() {
  const gate = await requireGate("/");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const [liveness, readiness, count] = await Promise.all([
    probeApi(apiUrl("/utils/health-check/")),
    probeApi(apiUrl("/utils/ready/")),
    organisationCount(gate.accessToken),
  ]);

  const cards = [
    mapLiveness(liveness),
    mapReadiness(readiness),
    workerCard(),
    releaseCard(env.NEXT_PUBLIC_RELEASE),
    organisationsCard(count),
  ];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          Platform health, read from the API. Nothing here changes anything.
        </p>
      </div>
      <section
        aria-label="Status"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((card) => (
          <StatusCard card={card} key={card.id} />
        ))}
      </section>
      <section className="space-y-1 rounded-lg border border-dashed p-4">
        <h2 className="font-medium">Verification and app entitlements</h2>
        <p className="text-muted-foreground text-sm">
          Not built yet. Reviewing organisation verification and switching apps
          on or off per organisation arrive in the next slice (C2).
        </p>
      </section>
    </>
  );
}
