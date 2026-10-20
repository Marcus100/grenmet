import {
  addTrailStopAction,
  createTrailAction,
  setTrailStatusAction,
} from "@/app/organisations/[organisationId]/rewards/actions";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { inputClass } from "@/components/form-styles";
import { listTrails, listVenues } from "@/lib/org-rewards";
import { TRAIL_KINDS, TRAIL_STATUSES } from "@/lib/org-rewards-options";
import { reportError } from "@/lib/report-error";
import { ActionForm, Field, selectClass } from "./action-form";
import { EmptyNote, FormPanel, SectionFailure } from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

const STATUS_LABELS = {
  active: "Active",
  archived: "Archived",
  draft: "Paused (draft)",
} as const;

async function venueChoices(token: string, organisationId: string) {
  try {
    return await listVenues(token, organisationId);
  } catch (error) {
    // Trails still list without venues; adding a stop just has fewer choices.
    reportError(error, "org-rewards-trails-venues");
    return [];
  }
}

export async function TrailsSection({ organisationId, token }: SectionProps) {
  let trails: Awaited<ReturnType<typeof listTrails>>;
  try {
    trails = await listTrails(token, organisationId);
  } catch (error) {
    return (
      <SettingsSection title="Trails and stops">
        <SectionFailure area="org-rewards-trails" error={error} />
      </SettingsSection>
    );
  }
  const venues = await venueChoices(token, organisationId);
  const venueName = new Map(venues.map((venue) => [venue.id, venue.name]));
  return (
    <div className="space-y-4">
      <SettingsSection title="Trails and stops">
        {trails.length === 0 ? (
          <EmptyNote>
            No trails yet. A trail is a set of venues people visit in person to
            collect stamps in their passport.
          </EmptyNote>
        ) : null}
        {trails.map((trail) => {
          const active = trail.status === "active";
          return (
            <SettingsRow
              action={
                trail.status === "archived" ? null : (
                  <ActionForm
                    action={setTrailStatusAction}
                    compact
                    organisationId={organisationId}
                    pendingLabel="Saving…"
                    submitLabel={active ? "Pause" : "Activate"}
                  >
                    <input name="trail_id" type="hidden" value={trail.id} />
                    <input
                      name="status"
                      type="hidden"
                      value={active ? "draft" : "active"}
                    />
                  </ActionForm>
                )
              }
              description={trail.description || `${trail.kind} trail`}
              key={trail.id}
              title={trail.name}
            >
              <StatusBadge tone={active ? "on" : "off"}>
                {STATUS_LABELS[trail.status]}
              </StatusBadge>
              {trail.stops.length === 0 ? (
                <p className="text-muted-foreground text-sm">No stops yet.</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {trail.stops.map((stop) => (
                    <li className="text-foreground" key={stop.id}>
                      {stop.position}. {stop.label}
                      <span className="text-muted-foreground">
                        {stop.venue_id
                          ? ` · ${venueName.get(stop.venue_id) ?? "venue"}`
                          : " · no venue"}
                        {stop.required_check_in ? " · needs a check-in" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground text-sm">
                  Add a stop to {trail.name}
                </summary>
                <ActionForm
                  action={addTrailStopAction}
                  className="mt-3"
                  organisationId={organisationId}
                  pendingLabel="Adding…"
                  submitLabel="Add stop"
                >
                  <input name="trail_id" type="hidden" value={trail.id} />
                  <Field id={`stop-label-${trail.id}`} label="Stop name">
                    <input
                      className={inputClass}
                      id={`stop-label-${trail.id}`}
                      maxLength={120}
                      name="label"
                      required
                      type="text"
                    />
                  </Field>
                  <Field
                    hint="Stops are added at the end, in order."
                    id={`stop-venue-${trail.id}`}
                    label="Venue"
                  >
                    <select
                      className={selectClass}
                      id={`stop-venue-${trail.id}`}
                      name="venue_id"
                    >
                      <option value="">No venue</option>
                      {venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>
                          {venue.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 text-foreground text-sm">
                    <input
                      defaultChecked
                      name="required_check_in"
                      type="checkbox"
                    />
                    Stamp only when someone checks in here (needs a venue)
                  </label>
                </ActionForm>
              </details>
            </SettingsRow>
          );
        })}
      </SettingsSection>
      <FormPanel title="Create a trail">
        <ActionForm
          action={createTrailAction}
          organisationId={organisationId}
          pendingLabel="Creating…"
          submitLabel="Create trail"
        >
          <Field id="trail-name" label="Name">
            <input
              className={inputClass}
              id="trail-name"
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field id="trail-description" label="Description (optional)">
            <input
              className={inputClass}
              id="trail-description"
              maxLength={500}
              name="description"
              type="text"
            />
          </Field>
          <Field id="trail-kind" label="Kind">
            <select className={selectClass} id="trail-kind" name="kind">
              {TRAIL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </Field>
          <Field id="trail-status" label="Start as">
            <select className={selectClass} id="trail-status" name="status">
              {TRAIL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === "draft" ? "Paused (draft)" : "Active"}
                </option>
              ))}
            </select>
          </Field>
          <Field id="trail-starts" label="Starts on (optional)">
            <input
              className={inputClass}
              id="trail-starts"
              name="starts_on"
              type="date"
            />
          </Field>
          <Field id="trail-ends" label="Ends on (optional)">
            <input
              className={inputClass}
              id="trail-ends"
              name="ends_on"
              type="date"
            />
          </Field>
        </ActionForm>
      </FormPanel>
    </div>
  );
}
