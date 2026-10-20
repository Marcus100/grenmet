import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { errorBoxClass, textLinkClass } from "@/components/form-styles";
import {
  type VenueCode,
  VenueCodeDisplay,
} from "@/components/org-rewards/venue-code-display";
import { requireAccount } from "@/lib/account";
import { listMyOrganisations } from "@/lib/account-organisations";
import { getVenueQrToken, listVenues } from "@/lib/org-rewards";
import { classifyFailure, FAILURE_TEXT } from "@/lib/org-rewards-errors";
import { isUuid, ORGANISATION_ID } from "@/lib/org-rewards-options";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = {
  title: "Venue check-in code — Barrels account",
};
// The code rotates every minute: never render this page from a cache.
export const dynamic = "force-dynamic";

type Shown =
  | { kind: "missing" }
  | { kind: "expired" }
  | {
      kind: "ready";
      blocked: null;
      initial: VenueCode | null;
      venueName: string;
    }
  | { kind: "blocked"; blocked: string; venueName: string };

/** Reads the venue and its first code; a brief outage leaves the screen retrying. */
async function loadVenueCode(
  token: string,
  organisationId: string,
  venueId: string
): Promise<Shown> {
  let venueName = "this venue";
  try {
    const venues = await listVenues(token, organisationId);
    const venue = venues.find((item) => item.id === venueId);
    if (!venue) return { kind: "missing" };
    venueName = venue.name;
    const code = await getVenueQrToken(token, organisationId, venueId);
    return {
      blocked: null,
      initial: {
        refreshAfterSeconds: code.refresh_after_seconds,
        token: code.token,
      },
      kind: "ready",
      venueName,
    };
  } catch (error) {
    const kind = classifyFailure(error);
    if (kind === "unauthorised") return { kind: "expired" };
    if (kind === "not-found") return { kind: "missing" };
    if (kind === "forbidden" || kind === "not-entitled") {
      return { blocked: FAILURE_TEXT[kind], kind: "blocked", venueName };
    }
    reportError(error, "org-rewards-venue-code");
    return { blocked: null, initial: null, kind: "ready", venueName };
  }
}

interface PageProps {
  params: Promise<{ organisationId: string; venueId: string }>;
}

export default async function VenueCodePage({ params }: PageProps) {
  const { organisationId, venueId } = await params;
  if (!(ORGANISATION_ID.test(organisationId) && isUuid(venueId))) notFound();
  const session = await requireAccount();
  const token = session.access_token;
  const memberships = await listMyOrganisations(token);
  const membership = memberships.find(
    (item) => item.organisation.id === organisationId
  );
  if (!membership) notFound();

  const shown = await loadVenueCode(token, organisationId, venueId);
  if (shown.kind === "missing") notFound();
  if (shown.kind === "expired") redirect("/?session=expired");
  const { blocked, initial, venueName } =
    shown.kind === "ready"
      ? shown
      : { blocked: shown.blocked, initial: null, venueName: shown.venueName };

  return (
    <AccountLayout
      current="/organisations"
      description="Show this at the venue. Rewards come from real visits: a customer has to be there to scan or type the code."
      title={`Check-in code: ${venueName}`}
    >
      <p>
        <Link
          className={textLinkClass}
          href={`/organisations/${organisationId}/rewards#venues`}
        >
          Back to rewards
        </Link>
      </p>
      {blocked ? (
        <p className={errorBoxClass} role="alert">
          {blocked}
        </p>
      ) : (
        <VenueCodeDisplay
          initial={initial}
          refreshUrl={`/api/organisations/${organisationId}/rewards/venues/${venueId}/qr-token`}
          venueName={venueName}
        />
      )}
    </AccountLayout>
  );
}
