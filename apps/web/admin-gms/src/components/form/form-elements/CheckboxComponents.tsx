"use client";
import { Checkbox } from "@grenmet/ui/components/ui/checkbox";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";

export default function CheckboxComponents() {
  const [isChecked, setIsChecked] = useState(false);
  const [isCheckedTwo, setIsCheckedTwo] = useState(true);
  const [isCheckedDisabled, setIsCheckedDisabled] = useState(false);
  return (
    <ComponentCard title="Checkbox">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={isChecked}
            onCheckedChange={(v) => setIsChecked(Boolean(v))}
          />
          <span className="block font-medium text-foreground text-sm">
            Default
          </span>
        </div>
        <label
          className="flex cursor-pointer items-center gap-3"
          htmlFor="cb-checked"
        >
          <Checkbox
            checked={isCheckedTwo}
            id="cb-checked"
            onCheckedChange={(v) => setIsCheckedTwo(Boolean(v))}
          />
          <span className="font-medium text-foreground text-sm">Checked</span>
        </label>
        <label
          className="flex cursor-not-allowed items-center gap-3 opacity-60"
          htmlFor="cb-disabled"
        >
          <Checkbox
            checked={isCheckedDisabled}
            disabled
            id="cb-disabled"
            onCheckedChange={(v) => setIsCheckedDisabled(Boolean(v))}
          />
          <span className="font-medium text-foreground text-sm">Disabled</span>
        </label>
      </div>
    </ComponentCard>
  );
}
