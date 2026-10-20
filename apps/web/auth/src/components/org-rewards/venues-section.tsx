import Link from "next/link";
import { createVenueAction } from "@/app/organisations/[organisationId]/rewards/actions";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { inputClass, textLinkClass } from "@/components/form-styles";
import { listVenues } from "@/lib/org-rewards";
import { ActionForm, Field } from "./action-form";
import { EmptyNote, FormPanel, SectionFailure } from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

export async function VenuesSection({ organisationId, token }: SectionProps) {
  let venues: Awaited<ReturnType<typeof listVenues>>;
  try {
    venues = await listVenues(token, organisationId);
  } catch (error) {
    return (
      <SettingsSection title="Venues and check-in codes">
        <SectionFailure area="org-rewards-venues" error={error} />
      </SettingsSection>
    );
  }
  return (
    <div className="space-y-4">
      <SettingsSection title="Venues and check-in codes">
        {venues.length === 0 ? (
          <EmptyNote>
            No venues yet. Add the places where customers check in.
          </EmptyNote>
        ) : null}
        {venues.map((venue) => (
          <SettingsRow
            action={
              venue.active ? (
                <Link
                  className={textLinkClass}
                  href={`/organisations/${organisationId}/rewards/venues/${venue.id}/code`}
                >
                  Display check-in code
                  <span className="sr-only"> for {venue.name}</span>
                </Link>
              ) : null
            }
            key={venue.id}
            title={venue.name}
          >
            <StatusBadge tone={venue.active ? "on" : "off"}>
              {venue.active ? "Active" : "Inactive"}
            </StatusBadge>
          </SettingsRow>
        ))}
      </SettingsSection>
      <FormPanel
        intro="Each venue gets a rotating code that proves someone is really there. Show it on a screen at the venue."
        title="Add a venue"
      >
        <ActionForm
          action={createVenueAction}
          organisationId={organisationId}
          pendingLabel="Adding…"
          submitLabel="Add venue"
        >
          <Field id="venue-name" label="Venue name">
            <input
              className={inputClass}
              id="venue-name"
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
        </ActionForm>
      </FormPanel>
    </div>
  );
}
