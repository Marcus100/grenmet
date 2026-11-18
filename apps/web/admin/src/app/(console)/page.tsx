import { Card } from "@barrelsgd/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CONSOLE_NAV } from "@/components/console-nav";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        description="Platform health, read from the API. Nothing here changes anything."
        title="Overview"
      />
      <section
        aria-label="Status"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cards.map((card) => (
          <StatusCard card={card} key={card.id} />
        ))}
      </section>
      <section aria-labelledby="shortcuts-heading" className="space-y-3">
        <h2 className="text-sm font-medium" id="shortcuts-heading">
          Go to
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CONSOLE_NAV.flatMap((group) => group.items)
            .filter((item) => item.href !== "/")
            .map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  className="focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
                  href={item.href as Route}
                  key={item.href}
                >
                  <Card className="hover:border-primary/40 h-full flex-row items-center gap-3 px-4 py-4 transition-colors">
                    <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border">
                      <Icon aria-hidden="true" className="size-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">
                      {item.title}
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                  </Card>
                </Link>
              );
            })}
        </div>
      </section>
    </>
  );
}
