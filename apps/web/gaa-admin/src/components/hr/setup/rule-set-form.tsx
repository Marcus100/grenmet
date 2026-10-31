"use client";

import type {
  RosterRuleSetPublic,
  RosterRuleSetUpdate,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useState } from "react";

type Kind = "int" | "hours" | "rate" | "time";

interface FieldDef {
  key: keyof RosterRuleSetUpdate;
  kind: Kind;
  label: string;
  /** Empty switches the rule off. */
  optional: boolean;
}

interface Group {
  description: string;
  fields: FieldDef[];
  title: string;
}

/** Every numeric or time rule value, grouped by the confirmed rules. */
export const RULE_GROUPS: Group[] = [
  {
    title: "Consecutive shifts",
    description:
      "Rotation staff: at most this many shifts in a row, then this many days off.",
    fields: [
      {
        key: "max_consecutive_shifts",
        label: "Most shifts in a row",
        kind: "int",
        optional: true,
      },
      {
        key: "min_days_off_after_run",
        label: "Days off after that run",
        kind: "int",
        optional: true,
      },
    ],
  },
  {
    title: "Hours",
    description: "Weeks run Sunday to Saturday.",
    fields: [
      {
        key: "shift_daily_hours",
        label: "Shift workers: hours a day",
        kind: "hours",
        optional: true,
      },
      {
        key: "shift_weekly_hours",
        label: "Shift workers: hours a week",
        kind: "hours",
        optional: true,
      },
      {
        key: "non_shift_daily_hours",
        label: "Non-shift staff: hours a day",
        kind: "hours",
        optional: true,
      },
      {
        key: "non_shift_weekly_hours",
        label: "Non-shift staff: hours a week",
        kind: "hours",
        optional: true,
      },
    ],
  },
  {
    title: "Weekends",
    description:
      "In every run of this many weekends: one full weekend off, plus one other Saturday and one other Sunday off.",
    fields: [
      {
        key: "weekend_window_weeks",
        label: "Weekends in each check",
        kind: "int",
        optional: true,
      },
    ],
  },
  {
    title: "Notice",
    description:
      "Changes to a published roster for a date sooner than this are warned.",
    fields: [
      {
        key: "notice_days",
        label: "Days of notice",
        kind: "int",
        optional: true,
      },
    ],
  },
  {
    title: "Overtime rate bands",
    description:
      "Overtime hours are counted at these rates on attendance and timesheets. Hours only; no pay is calculated.",
    fields: [
      {
        key: "weekday_first_hours",
        label: "Weekday: first hours",
        kind: "hours",
        optional: false,
      },
      {
        key: "weekday_first_rate",
        label: "Weekday: rate for those hours",
        kind: "rate",
        optional: false,
      },
      {
        key: "weekday_after_rate",
        label: "Weekday: rate after",
        kind: "rate",
        optional: false,
      },
      {
        key: "saturday_window_start",
        label: "Saturday window starts",
        kind: "time",
        optional: false,
      },
      {
        key: "saturday_window_end",
        label: "Saturday window ends",
        kind: "time",
        optional: false,
      },
      {
        key: "saturday_window_rate",
        label: "Saturday: rate inside the window",
        kind: "rate",
        optional: false,
      },
      {
        key: "saturday_after_rate",
        label: "Saturday: rate outside it",
        kind: "rate",
        optional: false,
      },
      {
        key: "rest_day_first_hours",
        label: "Sunday, holiday or day off: first hours",
        kind: "hours",
        optional: false,
      },
      {
        key: "rest_day_first_rate",
        label: "Sunday, holiday or day off: rate for those hours",
        kind: "rate",
        optional: false,
      },
      {
        key: "rest_day_after_rate",
        label: "Sunday, holiday or day off: rate after",
        kind: "rate",
        optional: false,
      },
      {
        key: "after_midnight_rate",
        label: "After midnight: lowest rate",
        kind: "rate",
        optional: false,
      },
    ],
  },
];

const FIELDS = RULE_GROUPS.flatMap((group) => group.fields);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DECIMAL = /^\d+\.\d+$/;

export interface RuleSetValues {
  overtime_bands_enabled: boolean;
  text: Record<string, string>;
  work_pattern: "ROTATION" | "WEEKDAYS";
  worker_type: "SHIFT" | "NON_SHIFT";
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Decimals arrive as "8.00"; show "8".
  return DECIMAL.test(text) ? String(Number(text)) : text;
}

export function valuesFrom(ruleSet: RosterRuleSetPublic): RuleSetValues {
  return {
    text: Object.fromEntries(
      FIELDS.map((field) => [field.key, display(ruleSet[field.key])])
    ),
    work_pattern: ruleSet.work_pattern ?? "ROTATION",
    worker_type: ruleSet.worker_type ?? "SHIFT",
    overtime_bands_enabled: ruleSet.overtime_bands_enabled ?? true,
  };
}

function problemFor(field: FieldDef, raw: string): string | null {
  const value = raw.trim();
  if (value === "")
    return field.optional ? null : `${field.label} is required.`;
  if (field.kind === "time") {
    return TIME.test(value)
      ? null
      : `${field.label} must be a time like 08:00.`;
  }
  const number = Number(value);
  if (Number.isNaN(number)) return `${field.label} must be a number.`;
  if (field.kind === "int" && !(Number.isInteger(number) && number >= 1)) {
    return `${field.label} must be a whole number of at least 1.`;
  }
  if (field.kind === "rate" && !(number >= 1 && number <= 10)) {
    return `${field.label} must be between 1 and 10.`;
  }
  if (field.kind === "hours" && !(number >= 0 && number <= 168)) {
    return `${field.label} must be between 0 and 168 hours.`;
  }
  return null;
}

export function validateRuleSet(values: RuleSetValues): string | null {
  for (const field of FIELDS) {
    const problem = problemFor(field, values.text[field.key] ?? "");
    if (problem) return problem;
  }
  const start = values.text.saturday_window_start ?? "";
  const end = values.text.saturday_window_end ?? "";
  if (start && end && start >= end) {
    return "The Saturday window must start before it ends.";
  }
  return null;
}

export function bodyFrom(values: RuleSetValues): RosterRuleSetUpdate {
  const body: Record<string, unknown> = {
    work_pattern: values.work_pattern,
    worker_type: values.worker_type,
    overtime_bands_enabled: values.overtime_bands_enabled,
  };
  for (const field of FIELDS) {
    const raw = (values.text[field.key] ?? "").trim();
    if (field.kind === "time") body[field.key] = raw;
    else body[field.key] = raw === "" ? null : Number(raw);
  }
  return body as RosterRuleSetUpdate;
}

interface RuleSetFormProps {
  canEdit: boolean;
  idPrefix: string;
  initial: RuleSetValues;
  onSave: (body: RosterRuleSetUpdate) => void;
  saveLabel: string;
  saving: boolean;
}

export function RuleSetForm({
  idPrefix,
  initial,
  canEdit,
  saving,
  saveLabel,
  onSave,
}: RuleSetFormProps) {
  const [edited, setEdited] = useState<RuleSetValues>();
  const values = edited ?? initial;
  const problem = edited ? validateRuleSet(values) : null;

  function setText(key: string, value: string) {
    setEdited({ ...values, text: { ...values.text, [key]: value } });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!edited || problem) return;
        onSave(bodyFrom(values));
        setEdited(undefined);
      }}
    >
      <FieldGroup className="flex-row flex-wrap gap-4">
        <Field className="w-auto">
          <FieldLabel htmlFor={`${idPrefix}-pattern`}>Work pattern</FieldLabel>
          <NativeSelect
            disabled={!canEdit}
            id={`${idPrefix}-pattern`}
            onChange={(event) =>
              setEdited({
                ...values,
                work_pattern: event.target
                  .value as RuleSetValues["work_pattern"],
              })
            }
            value={values.work_pattern}
          >
            <option value="ROTATION">Rotation (consecutive-shift rule)</option>
            <option value="WEEKDAYS">Monday to Friday (D shift)</option>
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor={`${idPrefix}-worker`}>Staff are</FieldLabel>
          <NativeSelect
            disabled={!canEdit}
            id={`${idPrefix}-worker`}
            onChange={(event) =>
              setEdited({
                ...values,
                worker_type: event.target.value as RuleSetValues["worker_type"],
              })
            }
            value={values.worker_type}
          >
            <option value="SHIFT">Shift workers</option>
            <option value="NON_SHIFT">Non-shift staff</option>
          </NativeSelect>
        </Field>
      </FieldGroup>
      {RULE_GROUPS.map((group) => (
        <FieldSet key={group.title}>
          <FieldLegend variant="label">{group.title}</FieldLegend>
          <FieldDescription>{group.description}</FieldDescription>
          {group.title === "Overtime rate bands" ? (
            <Field orientation="horizontal">
              <Checkbox
                checked={values.overtime_bands_enabled}
                disabled={!canEdit}
                id={`${idPrefix}-overtime`}
                onCheckedChange={(checked) =>
                  setEdited({
                    ...values,
                    overtime_bands_enabled: checked === true,
                  })
                }
              />
              <FieldLabel htmlFor={`${idPrefix}-overtime`}>
                Count overtime by rate band
              </FieldLabel>
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-4">
            {group.fields.map((field) => (
              <Field className="w-auto" key={field.key}>
                <FieldLabel htmlFor={`${idPrefix}-${field.key}`}>
                  {field.label}
                </FieldLabel>
                <Input
                  className={field.kind === "time" ? "w-24" : "w-20"}
                  disabled={!canEdit}
                  id={`${idPrefix}-${field.key}`}
                  inputMode={field.kind === "int" ? "numeric" : "decimal"}
                  onChange={(event) => setText(field.key, event.target.value)}
                  placeholder={field.optional ? "Off" : undefined}
                  value={values.text[field.key] ?? ""}
                />
              </Field>
            ))}
          </div>
        </FieldSet>
      ))}
      <p className="text-muted-foreground text-xs">
        Leave a limit empty to switch that rule off. There is no minimum-rest
        rule. A break shows a warning; a supervisor can still save with a
        reason, which is recorded.
      </p>
      {problem ? (
        <p className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            disabled={!edited || Boolean(problem) || saving}
            type="submit"
          >
            {saveLabel}
          </Button>
          <Button
            disabled={!edited}
            onClick={() => setEdited(undefined)}
            type="button"
            variant="outline"
          >
            Discard
          </Button>
        </div>
      ) : null}
    </form>
  );
}
