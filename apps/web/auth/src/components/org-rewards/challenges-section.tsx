import {
  createChallengeAction,
  setChallengeStatusAction,
} from "@/app/organisations/[organisationId]/rewards/actions";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { inputClass } from "@/components/form-styles";
import { listChallenges } from "@/lib/org-rewards";
import { CHALLENGE_METRICS } from "@/lib/org-rewards-options";
import { ActionForm, Field, selectClass } from "./action-form";
import { EmptyNote, FormPanel, SectionFailure } from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

/** The API answers 404 for every challenge route until the flag is on. */
export const CHALLENGES_NOT_ENABLED =
  "Community challenges aren't enabled for your organisation yet. They are switched on in stages; nothing is lost, and this page will show them once they are.";

const metricNames = new Map<string, string>(
  CHALLENGE_METRICS.map((metric) => [metric.key, metric.label])
);

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "America/Grenada",
  });
}

export async function ChallengesSection({
  organisationId,
  token,
}: SectionProps) {
  let challenges: Awaited<ReturnType<typeof listChallenges>>;
  try {
    challenges = await listChallenges(token, organisationId);
  } catch (error) {
    return (
      <SettingsSection title="Community challenges">
        <SectionFailure
          area="org-rewards-challenges"
          error={error}
          options={{ notFound: CHALLENGES_NOT_ENABLED }}
        />
      </SettingsSection>
    );
  }
  return (
    <div className="space-y-4">
      <SettingsSection title="Community challenges">
        {challenges.length === 0 ? (
          <EmptyNote>
            No challenges yet. A challenge sets a shared goal, such as 500
            check-ins this month, and reports the total. Progress is shown for
            everyone together, never for individuals.
          </EmptyNote>
        ) : null}
        {challenges.map((challenge) => {
          const paused = challenge.status === "paused";
          return (
            <SettingsRow
              action={
                <ActionForm
                  action={setChallengeStatusAction}
                  compact
                  organisationId={organisationId}
                  pendingLabel="Saving…"
                  submitLabel={paused ? "Resume" : "Pause"}
                >
                  <input
                    name="challenge_id"
                    type="hidden"
                    value={challenge.id}
                  />
                  <input
                    name="pause"
                    type="hidden"
                    value={paused ? "false" : "true"}
                  />
                </ActionForm>
              }
              description={`${metricNames.get(challenge.metric) ?? challenge.metric}: ${challenge.total} of ${challenge.target_total}. ${day(challenge.starts_at)} to ${day(challenge.ends_at)}.${challenge.reward_description ? ` Thank-you: ${challenge.reward_description}` : ""}`}
              key={challenge.id}
              title={challenge.name}
            >
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={paused ? "off" : "on"}>
                  {paused ? "Paused" : "Active"}
                </StatusBadge>
                {challenge.completed ? (
                  <StatusBadge tone="neutral">Goal reached</StatusBadge>
                ) : null}
              </div>
            </SettingsRow>
          );
        })}
      </SettingsSection>
      <FormPanel
        intro="A thank-you is text only. It doesn't create stamps or any cash value."
        title="Create a challenge"
      >
        <ActionForm
          action={createChallengeAction}
          organisationId={organisationId}
          pendingLabel="Creating…"
          submitLabel="Create challenge"
        >
          <Field id="challenge-name" label="Name">
            <input
              className={inputClass}
              id="challenge-name"
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field id="challenge-description" label="Description (optional)">
            <input
              className={inputClass}
              id="challenge-description"
              maxLength={500}
              name="description"
              type="text"
            />
          </Field>
          <Field id="challenge-metric" label="What counts">
            <select className={selectClass} id="challenge-metric" name="metric">
              {CHALLENGE_METRICS.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            hint="Whole number up to 1,000,000."
            id="challenge-target"
            label="Shared target"
          >
            <input
              className={inputClass}
              id="challenge-target"
              inputMode="numeric"
              name="target_total"
              required
              type="text"
            />
          </Field>
          <Field
            hint="Dates are in Grenada time. The challenge runs from the start of the first day to the end of the last."
            id="challenge-starts"
            label="First day"
          >
            <input
              className={inputClass}
              id="challenge-starts"
              name="starts_on"
              required
              type="date"
            />
          </Field>
          <Field id="challenge-ends" label="Last day">
            <input
              className={inputClass}
              id="challenge-ends"
              name="ends_on"
              required
              type="date"
            />
          </Field>
          <Field id="challenge-reward" label="Thank-you text (optional)">
            <input
              className={inputClass}
              id="challenge-reward"
              maxLength={500}
              name="reward_description"
              type="text"
            />
          </Field>
        </ActionForm>
      </FormPanel>
    </div>
  );
}
