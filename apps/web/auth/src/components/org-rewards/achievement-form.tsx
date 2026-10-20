"use client";

import { useState } from "react";
import { createAchievementAction } from "@/app/organisations/[organisationId]/rewards/actions";
import { inputClass } from "@/components/form-styles";
import { ACHIEVEMENT_RULES, checkAchievement } from "@/lib/org-rewards-options";
import { ActionForm, Field, selectClass } from "./action-form";

interface TrailChoice {
  readonly id: string;
  readonly name: string;
}

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validate(data: FormData): string | null {
  const checked = checkAchievement({
    days: text(data, "days"),
    key: text(data, "key"),
    n: text(data, "n"),
    name: text(data, "name"),
    ruleType: text(data, "rule_type"),
    trailId: text(data, "trail_id"),
  });
  return checked.ok ? null : checked.message;
}

/** Create an achievement; the rule decides which parameter is asked for. */
export function AchievementForm({
  organisationId,
  trails,
}: {
  readonly organisationId: string;
  readonly trails: readonly TrailChoice[];
}) {
  const [rule, setRule] = useState<string>(ACHIEVEMENT_RULES[0].key);
  return (
    <ActionForm
      action={createAchievementAction}
      organisationId={organisationId}
      pendingLabel="Creating…"
      submitLabel="Create achievement"
      validate={validate}
    >
      <Field
        hint="Lowercase words joined by hyphens. It can't be changed later."
        id="achievement-key"
        label="Key"
      >
        <input
          autoComplete="off"
          className={inputClass}
          id="achievement-key"
          maxLength={60}
          name="key"
          required
          type="text"
        />
      </Field>
      <Field id="achievement-name" label="Name">
        <input
          className={inputClass}
          id="achievement-name"
          maxLength={120}
          name="name"
          required
          type="text"
        />
      </Field>
      <Field id="achievement-description" label="Description (optional)">
        <input
          className={inputClass}
          id="achievement-description"
          maxLength={500}
          name="description"
          type="text"
        />
      </Field>
      <Field id="achievement-rule" label="Earned when someone">
        <select
          className={selectClass}
          id="achievement-rule"
          name="rule_type"
          onChange={(event) => setRule(event.target.value)}
          value={rule}
        >
          {ACHIEVEMENT_RULES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      {rule === "attended_n_events" ? (
        <Field
          hint="A whole number from 1 to 1000."
          id="achievement-n"
          label="Events needed"
        >
          <input
            className={inputClass}
            id="achievement-n"
            inputMode="numeric"
            name="n"
            type="text"
          />
        </Field>
      ) : null}
      {rule === "streak_days" ? (
        <Field
          hint="A whole number from 2 to 365."
          id="achievement-days"
          label="Days in a row"
        >
          <input
            className={inputClass}
            id="achievement-days"
            inputMode="numeric"
            name="days"
            type="text"
          />
        </Field>
      ) : null}
      {rule === "visited_all_stops_of_trail" ? (
        <Field
          hint={
            trails.length === 0
              ? "Create a trail first, then come back."
              : "Earned once every stop on the trail has a check-in."
          }
          id="achievement-trail"
          label="Trail"
        >
          <select
            className={selectClass}
            id="achievement-trail"
            name="trail_id"
          >
            <option value="">Choose a trail</option>
            {trails.map((trail) => (
              <option key={trail.id} value={trail.id}>
                {trail.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </ActionForm>
  );
}
