"use client";
import {
  RadioGroup,
  RadioGroupItem,
} from "@grenmet/ui/components/ui/radio-group";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";

export default function RadioButtons() {
  const [selectedValue, setSelectedValue] = useState<string>("option2");

  return (
    <ComponentCard title="Radio Buttons">
      <RadioGroup
        className="flex flex-wrap items-center gap-8"
        onValueChange={(v) => setSelectedValue(v as string)}
        value={selectedValue}
      >
        <label
          className="flex cursor-pointer items-center gap-3 font-medium text-gray-700 text-sm"
          htmlFor="radio1"
        >
          <RadioGroupItem id="radio1" value="option1" />
          Default
        </label>
        <label
          className="flex cursor-pointer items-center gap-3 font-medium text-gray-700 text-sm"
          htmlFor="radio2"
        >
          <RadioGroupItem id="radio2" value="option2" />
          Selected
        </label>
        <label
          className="flex cursor-not-allowed items-center gap-3 font-medium text-gray-300 text-sm"
          htmlFor="radio3"
        >
          <RadioGroupItem disabled id="radio3" value="option3" />
          Disabled
        </label>
      </RadioGroup>
    </ComponentCard>
  );
}
