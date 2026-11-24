import type { Metadata } from "next";
import Link from "next/link";
import { ServicesSection } from "@/components/studio/settings/settings-sections";
import { StudioAlert } from "@/components/studio/studio-alert";
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
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">{org.name}</p>
        <h1 className="text-2xl font-semibold">Services</h1>
        <Link
          className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
          href={{ pathname: `/studio/${orgSlug}/settings` }}
        >
          Business settings
        </Link>
      </header>
      <ServicesSection
        currency={data.profile?.currency ?? "XCD"}
        depositsAvailable={data.deposits_available}
        editable={canManageBookings(org.role)}
        orgSlug={orgSlug}
        profile={data.profile}
        services={data.services}
      />
    </div>
  );
}
