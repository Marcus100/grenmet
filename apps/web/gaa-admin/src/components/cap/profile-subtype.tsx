"use client";
import type {
  CapCategory,
  CapProfileRule,
  CapProfileSubtype,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { CAP_CATEGORY_LABELS } from "@/lib/cap-hazards";
import { emptyRule } from "@/lib/cap-profile-defaults";
import { ProfileField } from "./profile-field";

export function ProfileSubtypeEditor({
  subtype,
  onChange,
  onRemove,
}: {
  subtype: CapProfileSubtype;
  onChange: (value: CapProfileSubtype) => void;
  onRemove: () => void;
}) {
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
          {(Object.keys(CAP_CATEGORY_LABELS) as CapCategory[]).map(
            (category) => (
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
                {CAP_CATEGORY_LABELS[category]}
              </Label>
            )
          )}
        </div>
      </fieldset>
      <h3 className="font-medium">Assessment rules</h3>
      <p className="text-muted-foreground text-sm">
        Rules support a forecaster's assessment; they do not issue alerts
        automatically. Use “observed” for a documented qualitative trigger.
      </p>
      {rules.map((rule, index) => (
        <fieldset className="space-y-3 border p-3" key={rule.id}>
          <legend>Rule {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              onValueChange={(level) =>
                updateRule(index, {
                  level: level as "Advisory" | "Watch" | "Warning",
                })
              }
              value={rule.level ?? "Warning"}
            >
              <SelectTrigger aria-label="Rule message level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Advisory", "Watch", "Warning"].map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ProfileField
              label="Metric or observed condition"
              onChange={(metric) => updateRule(index, { metric })}
              value={rule.metric ?? ""}
            />
            <Select
              onValueChange={(operator) =>
                updateRule(index, {
                  operator: operator as CapProfileRule["operator"],
                })
              }
              value={rule.operator ?? ">="}
            >
              <SelectTrigger aria-label="Rule comparison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[">=", ">", "<=", "<", "observed"].map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {operator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rule.operator !== "observed" && (
              <>
                <ProfileField
                  label="Threshold"
                  onChange={(v) =>
                    updateRule(index, {
                      threshold: v === "" ? null : Number(v),
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
                  onChange={(v) =>
                    updateRule(index, {
                      duration_minutes: v === "" ? null : Number(v),
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
            variant="outline"
          >
            Remove rule {index + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        onClick={() => onChange({ ...subtype, rules: [...rules, emptyRule()] })}
        variant="outline"
      >
        Add assessment rule
      </Button>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["impacts", "responses", "affected_groups"] as const).map((field) => (
          <ProfileField
            key={field}
            label={`${field.replace("_", " ")} (one per line)`}
            multiline
            onChange={(value) =>
              onChange({ ...subtype, [field]: value ? value.split("\n") : [] })
            }
            value={(subtype[field] ?? []).join("\n")}
          />
        ))}
      </div>
      <Button onClick={onRemove} variant="outline">
        Remove subtype
      </Button>
    </details>
  );
}
