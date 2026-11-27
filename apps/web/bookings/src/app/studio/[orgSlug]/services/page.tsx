import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { ServicesSection } from "@/components/studio/settings/settings-sections";
import { StudioAlert } from "@/components/studio/studio-alert";
import { CARD, SECONDARY_ACTION } from "@/components/studio/studio-ui";
import { requireSession } from "@/lib/session";
import { loadSettings } from "@/lib/settings-load";
import { canManageBookings } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Services",
};

interface ServicesPageProps {
  params: Promise<{ orgSlug: string }>;
}

/** The services a business sells: the same section as Settings, on its own page. */
export default async function ServicesPage({ params }: ServicesPageProps) {
  const { orgSlug } = await params;
  const here = `/studio/${orgSlug}/services`;
  const session = await requireSession(here);

  const loaded = await loadSettings(session, orgSlug, here);
  if (!loaded.ok) {
    return (
      <StudioAlert
        backHref={loaded.backHref}
        backLabel={loaded.backLabel}
        failure={loaded.failure}
      />
    );
  }
  const { org, data } = loaded;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link
            className={SECONDARY_ACTION}
            href={{ pathname: `/studio/${orgSlug}/settings` }}
          >
            Business settings
          </Link>
        }
        title="Services"
      />
      <div className={CARD}>
        <ServicesSection
          currency={data.profile?.currency ?? "XCD"}
          depositsAvailable={data.deposits_available}
          editable={canManageBookings(org.role)}
          orgSlug={orgSlug}
          profile={data.profile}
          providers={data.providers}
          services={data.services}
        />
      </div>
    </div>
  );
}
