import {
  createProgrammeAction,
  setProgrammeStatusAction,
} from "@/app/organisations/[organisationId]/rewards/actions";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { inputClass } from "@/components/form-styles";
import { listProgrammes } from "@/lib/org-rewards";
import { QUALIFYING_SOURCES, sourceLabel } from "@/lib/org-rewards-options";
import { ActionForm, Field, selectClass } from "./action-form";
import { EmptyNote, FormPanel, SectionFailure } from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

export async function ProgrammesSection({
  organisationId,
  token,
}: SectionProps) {
  let programmes: Awaited<ReturnType<typeof listProgrammes>>;
  try {
    programmes = await listProgrammes(token, organisationId);
  } catch (error) {
    return (
      <SettingsSection title="Stamp cards">
        <SectionFailure area="org-rewards-programmes" error={error} />
      </SettingsSection>
    );
  }
  return (
    <div className="space-y-4">
      <SettingsSection title="Stamp cards">
        {programmes.length === 0 ? (
          <EmptyNote>
            No stamp cards yet. Create one below; customers collect a stamp for
            each real visit or purchase that qualifies.
          </EmptyNote>
        ) : null}
        {programmes.map((programme) => {
          const paused = programme.status === "paused";
          return (
            <SettingsRow
              action={
                <ActionForm
                  action={setProgrammeStatusAction}
                  compact
                  organisationId={organisationId}
                  pendingLabel="Saving…"
                  submitLabel={paused ? "Resume" : "Pause"}
                >
                  <input name="program_id" type="hidden" value={programme.id} />
                  <input
                    name="pause"
                    type="hidden"
                    value={paused ? "false" : "true"}
                  />
                </ActionForm>
              }
              description={`${programme.stamps_required} stamps for ${programme.reward_description}. Earned by: ${sourceLabel(programme.qualifying_source_type)}.`}
              key={programme.id}
              title={programme.name}
            >
              <StatusBadge tone={paused ? "off" : "on"}>
                {paused ? "Paused" : "Active"}
              </StatusBadge>
            </SettingsRow>
          );
        })}
      </SettingsSection>
      <FormPanel
        intro="Stamps are earned by real-world actions, never by opening the app, and they are never ranked by how much someone spends."
        title="Create a stamp card"
      >
        <ActionForm
          action={createProgrammeAction}
          organisationId={organisationId}
          pendingLabel="Creating…"
          submitLabel="Create stamp card"
        >
          <Field id="programme-name" label="Name">
            <input
              className={inputClass}
              id="programme-name"
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field id="programme-source" label="A stamp is earned by">
            <select
              className={selectClass}
              defaultValue={QUALIFYING_SOURCES[0].key}
              id="programme-source"
              name="qualifying_source_type"
            >
              {QUALIFYING_SOURCES.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label} ({source.description})
                </option>
              ))}
            </select>
          </Field>
          <Field
            hint="A whole number from 1 to 100."
            id="programme-stamps"
            label="Stamps for a reward"
          >
            <input
              className={inputClass}
              id="programme-stamps"
              inputMode="numeric"
              name="stamps_required"
              required
              type="text"
            />
          </Field>
          <Field id="programme-reward" label="Reward">
            <input
              className={inputClass}
              id="programme-reward"
              maxLength={500}
              name="reward_description"
              required
              type="text"
            />
          </Field>
          <Field
            hint="From 1 to 10. Leave as 1 unless one visit should count for more."
            id="programme-per-source"
            label="Stamps per qualifying action"
          >
            <input
              className={inputClass}
              defaultValue="1"
              id="programme-per-source"
              inputMode="numeric"
              name="stamps_per_source"
              type="text"
            />
          </Field>
          <Field
            hint="Optional. Leave empty for no limit."
            id="programme-cap"
            label="Most rewards per person, ever"
          >
            <input
              className={inputClass}
              id="programme-cap"
              inputMode="numeric"
              name="max_redemptions_per_account"
              type="text"
            />
          </Field>
        </ActionForm>
      </FormPanel>
    </div>
  );
}
