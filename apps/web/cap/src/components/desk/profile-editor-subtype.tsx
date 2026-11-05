"use client";

import type {
  CapProfileColourResponse,
  CapProfileImpactLevel,
  CapProfileRule,
  CapProfileSubtype,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useGmsCatalogue } from "@/components/desk/gms-catalogue";
import { ProfileField } from "@/components/desk/profile-field";
import { categoryKeys, categoryLabel } from "@/lib/desk/cap/cap-hazards";
import { colourLabel, type GmsProduct } from "@/lib/desk/cap/cap-levels";
import { emptyRule } from "@/lib/desk/profile-defaults";
import {
  PROFILE_COLOUR_MEANING,
  starterColourResponses,
  starterImpactLevels,
} from "@/lib/desk/profile-matrix";

const OPERATORS: CapProfileRule["operator"][] = [
  ">=",
  ">",
  "<=",
  "<",
  "observed",
];

/** One subtype of a hazard: its name, rules, impacts, responses and matrix text. */
export function ProfileSubtypeEditor({
  subtype,
  onChange,
  onRemove,
}: {
  subtype: CapProfileSubtype;
  onChange: (value: CapProfileSubtype) => void;
  onRemove: () => void;
}) {
  const catalogue = useGmsCatalogue();
  const rules = subtype.rules ?? [];

  function updateRule(index: number, patch: Partial<CapProfileRule>) {
    onChange({
      ...subtype,
      rules: rules.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule
      ),
    });
  }

  return (
    <details className="space-y-4 rounded-lg border p-4" open>
      <summary className="cursor-pointer font-medium">
        {subtype.name || "Unnamed subtype"}
      </summary>
      <ProfileField
        label="Subtype name"
        onChange={(name) => onChange({ ...subtype, name })}
        value={subtype.name}
      />
      <fieldset>
        <legend className="mb-2 text-sm">CAP category mappings</legend>
        <div className="flex flex-wrap gap-3">
          {categoryKeys(catalogue).map((category) => (
            <Label key={category}>
              <Checkbox
                checked={(subtype.categories ?? []).includes(category)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...subtype,
                    categories: checked
                      ? [...(subtype.categories ?? []), category]
                      : (subtype.categories ?? []).filter(
                          (c) => c !== category
                        ),
                  })
                }
              />
              {categoryLabel(catalogue, category)}
            </Label>
          ))}
        </div>
      </fieldset>
      <h3 className="font-medium">Assessment rules</h3>
      <p className="text-muted-foreground text-body-sm">
        Rules support a forecaster&apos;s assessment; they do not issue warnings
        automatically. Use &ldquo;observed&rdquo; for a documented qualitative
        trigger.
      </p>
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">
          No assessment rules yet. Add one for each message level.
        </p>
      ) : null}
      {rules.map((rule, index) => (
        <fieldset className="space-y-3 rounded-md border p-3" key={rule.id}>
          <legend className="px-1 text-sm">Rule {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`rule-level-${rule.id}`}>
                Rule message level
              </Label>
              <NativeSelect
                id={`rule-level-${rule.id}`}
                onChange={(event) =>
                  updateRule(index, { level: event.target.value as GmsProduct })
                }
                value={rule.level ?? "Warning"}
              >
                {catalogue.products.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.key}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <ProfileField
              label="Metric or observed condition"
              onChange={(metric) => updateRule(index, { metric })}
              value={rule.metric ?? ""}
            />
            <div className="space-y-2">
              <Label htmlFor={`rule-operator-${rule.id}`}>
                Rule comparison
              </Label>
              <NativeSelect
                id={`rule-operator-${rule.id}`}
                onChange={(event) =>
                  updateRule(index, {
                    operator: event.target.value as CapProfileRule["operator"],
                  })
                }
                value={rule.operator ?? ">="}
              >
                {OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {rule.operator === "observed" ? null : (
              <>
                <ProfileField
                  label="Threshold"
                  onChange={(value) =>
                    updateRule(index, {
                      threshold: value === "" ? null : Number(value),
                    })
                  }
                  type="number"
                  value={rule.threshold == null ? "" : String(rule.threshold)}
                />
                <ProfileField
                  label="Unit"
                  onChange={(unit) => updateRule(index, { unit })}
                  value={rule.unit ?? ""}
                />
                <ProfileField
                  label="Duration (minutes)"
                  onChange={(value) =>
                    updateRule(index, {
                      duration_minutes: value === "" ? null : Number(value),
                    })
                  }
                  type="number"
                  value={
                    rule.duration_minutes == null
                      ? ""
                      : String(rule.duration_minutes)
                  }
                />
              </>
            )}
            <ProfileField
              label="Applicable location or area"
              onChange={(area) => updateRule(index, { area })}
              value={rule.area ?? ""}
            />
            <ProfileField
              label="Evidence source and rationale"
              multiline
              onChange={(evidence) => updateRule(index, { evidence })}
              value={rule.evidence ?? ""}
            />
          </div>
          <Button
            onClick={() =>
              onChange({
                ...subtype,
                rules: rules.filter((_, i) => i !== index),
              })
            }
            type="button"
            variant="outline"
          >
            Remove rule {index + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        onClick={() => onChange({ ...subtype, rules: [...rules, emptyRule()] })}
        type="button"
        variant="outline"
      >
        Add assessment rule
      </Button>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["impacts", "responses", "affected_groups"] as const).map((field) => (
          <ProfileField
            hint="One item per line."
            key={field}
            label={`${field.replace("_", " ")}`}
            multiline
            onChange={(value) =>
              onChange({ ...subtype, [field]: value ? value.split("\n") : [] })
            }
            value={(subtype[field] ?? []).join("\n")}
          />
        ))}
      </div>
      <SubtypeImpactEditor onChange={onChange} subtype={subtype} />
      <Button onClick={onRemove} type="button" variant="outline">
        Remove subtype
      </Button>
    </details>
  );
}

/**
 * What each impact level looks like for one hazard subtype, and the response
 * for each warning colour. Shown only with hazard library access.
 */
export function SubtypeImpactEditor({
  subtype,
  onChange,
}: {
  subtype: CapProfileSubtype;
  onChange: (next: CapProfileSubtype) => void;
}) {
  const catalogue = useGmsCatalogue();
  const levels = subtype.impact_levels ?? [];
  const responses = subtype.colour_responses ?? [];
  const started = levels.length > 0 || responses.length > 0;

  function setLevel(index: number, patch: Partial<CapProfileImpactLevel>) {
    onChange({
      ...subtype,
      impact_levels: levels.map((level, i) =>
        i === index ? { ...level, ...patch } : level
      ),
    });
  }
  function setResponse(
    index: number,
    patch: Partial<CapProfileColourResponse>
  ) {
    onChange({
      ...subtype,
      colour_responses: responses.map((r, i) =>
        i === index ? { ...r, ...patch } : r
      ),
    });
  }

  return (
    <section
      aria-label={`Impact levels and responses for ${subtype.name || "this subtype"}`}
      className="space-y-3 rounded-lg border border-dashed p-3"
    >
      <h3 className="font-medium">Impact levels and responses by colour</h3>
      <p className="text-muted-foreground text-body-sm">
        Set all four impact levels and all four colour responses, or none. A
        subtype with only some of them cannot be approved.
      </p>
      {started ? null : (
        <div className="space-y-2">
          <p className="text-body-sm">Not started for this subtype.</p>
          <Button
            onClick={() =>
              onChange({
                ...subtype,
                impact_levels: starterImpactLevels(),
                colour_responses: starterColourResponses(),
              })
            }
            type="button"
            variant="outline"
          >
            Start impact levels and responses
          </Button>
        </div>
      )}
      {levels.map((level, index) => (
        <ProfileField
          hint="One item per line."
          key={level.impact}
          label={`${level.impact} impact: what it looks like`}
          multiline
          onChange={(value) =>
            setLevel(index, { impacts: value ? value.split("\n") : [] })
          }
          value={(level.impacts ?? []).join("\n")}
        />
      ))}
      {responses.map((response, index) => (
        <ProfileField
          key={response.colour}
          label={`${colourLabel(catalogue, response.colour)} response (${PROFILE_COLOUR_MEANING[response.colour]})`}
          multiline
          onChange={(value) => setResponse(index, { response: value })}
          value={response.response ?? ""}
        />
      ))}
      {started ? (
        <Button
          onClick={() =>
            onChange({
              ...subtype,
              impact_levels: [],
              colour_responses: [],
              cell_texts: [],
            })
          }
          type="button"
          variant="outline"
        >
          Clear impact levels and responses
        </Button>
      ) : null}
    </section>
  );
}
