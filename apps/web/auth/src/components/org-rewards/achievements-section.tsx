import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { listAchievements, listTrails } from "@/lib/org-rewards";
import { ACHIEVEMENT_RULES } from "@/lib/org-rewards-options";
import { reportError } from "@/lib/report-error";
import { AchievementForm } from "./achievement-form";
import { EmptyNote, FormPanel, SectionFailure } from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

function describeRule(
  ruleType: string,
  parameters: Record<string, unknown>,
  trailNames: ReadonlyMap<string, string>
): string {
  if (ruleType === "attended_n_events") {
    return `Attend ${String(parameters.n)} events`;
  }
  if (ruleType === "streak_days") {
    return `Check in ${String(parameters.days)} days in a row`;
  }
  const trail = trailNames.get(String(parameters.trail_id));
  return `Visit every stop of ${trail ?? "a trail"}`;
}

async function trailChoices(token: string, organisationId: string) {
  try {
    return await listTrails(token, organisationId);
  } catch (error) {
    reportError(error, "org-rewards-achievements-trails");
    return [];
  }
}

export async function AchievementsSection({
  organisationId,
  token,
}: SectionProps) {
  let achievements: Awaited<ReturnType<typeof listAchievements>>;
  try {
    achievements = await listAchievements(token, organisationId);
  } catch (error) {
    return (
      <SettingsSection title="Achievements">
        <SectionFailure area="org-rewards-achievements" error={error} />
      </SettingsSection>
    );
  }
  const trails = await trailChoices(token, organisationId);
  const trailNames = new Map(trails.map((trail) => [trail.id, trail.name]));
  const ruleNames = new Map<string, string>(
    ACHIEVEMENT_RULES.map((rule) => [rule.key, rule.label])
  );
  return (
    <div className="space-y-4">
      <SettingsSection title="Achievements">
        {achievements.length === 0 ? (
          <EmptyNote>
            No achievements yet. Achievements recognise real visits and
            attendance, and can't be bought.
          </EmptyNote>
        ) : null}
        {achievements.map((item) => (
          <SettingsRow
            description={`${describeRule(item.rule_type, item.parameters, trailNames)}${item.description ? `. ${item.description}` : ""}`}
            key={item.id}
            title={item.name}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={item.active ? "on" : "off"}>
                {item.active ? "Active" : "Inactive"}
              </StatusBadge>
              <span className="text-muted-foreground text-sm">
                {ruleNames.get(item.rule_type) ?? item.rule_type} · key{" "}
                {item.key}
              </span>
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>
      <FormPanel title="Create an achievement">
        <AchievementForm
          organisationId={organisationId}
          trails={trails.map((trail) => ({ id: trail.id, name: trail.name }))}
        />
      </FormPanel>
    </div>
  );
}
