"use client";

import type { CapCategory } from "@barrelsgd/api-client";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { useId, useState } from "react";
import {
  CAP_CATEGORY_LABELS,
  CAP_HAZARD_GROUPS,
  suggestedCategories,
} from "@/lib/cap-hazards";

interface HazardClassificationProps {
  categories: CapCategory[];
  event: string;
  onCategoriesChange: (categories: CapCategory[]) => void;
  onEventChange: (event: string, categories: CapCategory[]) => void;
}

/** Hazard navigation is local; the explicit event and category values are saved in CAP. */
export function HazardClassification({
  categories,
  event,
  onCategoriesChange,
  onEventChange,
}: HazardClassificationProps) {
  const [family, setFamily] = useState("");
  const id = useId();
  const groups = family
    ? CAP_HAZARD_GROUPS.filter((group) => group.label === family)
    : CAP_HAZARD_GROUPS;

  function changeEvent(value: string) {
    const matchingGroup = CAP_HAZARD_GROUPS.find((group) =>
      group.events.some(
        (name) => name.toLowerCase() === value.trim().toLowerCase()
      )
    );
    if (matchingGroup) {
      setFamily(matchingGroup.label);
    }
    onEventChange(value, suggestedCategories(value));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-family`}>Hazard family</Label>
        <Select
          onValueChange={(value) => {
            const next = value ?? "";
            if (next !== family) {
              setFamily(next);
              onEventChange("", []);
            }
          }}
          value={family}
        >
          <SelectTrigger aria-label="Hazard family" id={`${id}-family`}>
            <SelectValue>
              {(value) => value || "Browse all hazard families"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Browse all hazard families</SelectItem>
            {CAP_HAZARD_GROUPS.map((group) => (
              <SelectItem key={group.label} value={group.label}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-event`}>Specific event *</Label>
        <Input
          aria-describedby={`${id}-help`}
          aria-label="Event"
          aria-required="true"
          id={`${id}-event`}
          list={`${id}-events`}
          onChange={(e) => changeEvent(e.target.value)}
          placeholder="e.g. Tropical Storm"
          value={event}
        />
        <datalist id={`${id}-events`}>
          {groups.flatMap((group) =>
            group.events.map((name) => (
              <option key={name} label={group.label} value={name} />
            ))
          )}
        </datalist>
        <p className="text-body-sm text-gm-text-muted" id={`${id}-help`}>
          Choose a family to narrow the events, or enter your own event name.
          Changing family clears the previous event. Assess the risk separately
          below.
        </p>
      </div>
      <p aria-live="polite" className="text-body-sm text-gm-text-muted">
        {categories.length
          ? `CAP mapping: ${categories.map((category) => CAP_CATEGORY_LABELS[category]).join(", ")}`
          : "No CAP category selected. Choose a listed event or set its mapping below."}
      </p>
      <details className="space-y-3">
        <summary className="cursor-pointer text-gm-text-primary text-label">
          Edit CAP category mappings
        </summary>
        <p className="text-body-sm text-gm-text-muted">
          These broad categories support CAP exchange. They do not replace the
          specific hazard or determine its severity. Custom events need at least
          one mapping.
        </p>
        <fieldset className="space-y-3">
          <legend className="text-gm-text-primary text-label">
            CAP categories (select at least one)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(CAP_CATEGORY_LABELS) as CapCategory[]).map(
              (category) => (
                <Label className="flex items-center gap-2" key={category}>
                  <Checkbox
                    checked={categories.includes(category)}
                    onCheckedChange={(checked) =>
                      onCategoriesChange(
                        checked
                          ? [...categories, category]
                          : categories.filter((value) => value !== category)
                      )
                    }
                  />
                  {CAP_CATEGORY_LABELS[category]}
                </Label>
              )
            )}
          </div>
        </fieldset>
      </details>
    </div>
  );
}
