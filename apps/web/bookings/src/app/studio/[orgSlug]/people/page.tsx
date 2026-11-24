import type { Metadata } from "next";
import Link from "next/link";
import { PeopleSection } from "@/components/studio/settings/settings-sections";
import { StudioAlert } from "@/components/studio/studio-alert";
import {
  CARD,
  SECONDARY_ACTION,
  StudioPageHeader,
} from "@/components/studio/studio-ui";
import { requireSession } from "@/lib/session";
import { loadSettings } from "@/lib/settings-load";
import { canManageBookings } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "People",
};

interface PeoplePageProps {
  params: Promise<{ orgSlug: string }>;
}

/** The people (or chairs, bays, rooms) who do the work: the same section as Settings. */
export default async function PeoplePage({ params }: PeoplePageProps) {
  const { orgSlug } = await params;
  const here = `/studio/${orgSlug}/people`;
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
      <StudioPageHeader
        action={
          <Link
            className={SECONDARY_ACTION}
            href={{ pathname: `/studio/${orgSlug}/settings` }}
          >
            Business settings
          </Link>
        }
        title="People"
      />
      <div className={CARD}>
        <PeopleSection
          editable={canManageBookings(org.role)}
          orgSlug={orgSlug}
          providers={data.providers}
          services={data.services}
        />
      </div>
    </div>
  );
}
