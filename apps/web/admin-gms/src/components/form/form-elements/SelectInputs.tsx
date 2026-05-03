"use client";
import { useState } from "react";
import { ChevronDownIcon } from "@/icons";
import ComponentCard from "../../common/ComponentCard";
import Label from "../Label";
import MultiSelect from "../MultiSelect";
import Select from "../Select";

export default function SelectInputs() {
  const options = [
    { value: "marketing", label: "Marketing" },
    { value: "template", label: "Template" },
    { value: "development", label: "Development" },
  ];

  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const handleSelectChange = (_value: string) => undefined;

  const multiOptions = [
    { value: "1", text: "Option 1", selected: false },
    { value: "2", text: "Option 2", selected: false },
    { value: "3", text: "Option 3", selected: false },
    { value: "4", text: "Option 4", selected: false },
    { value: "5", text: "Option 5", selected: false },
  ];

  return (
    <ComponentCard title="Select Inputs">
      <div className="space-y-6">
        <div>
          <Label>Select Input</Label>
          <div className="relative">
            <Select
              className="dark:bg-dark-900"
              onChange={handleSelectChange}
              options={options}
              placeholder="Select Option"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              <ChevronDownIcon />
            </span>
          </div>
        </div>
        <div className="relative">
          <MultiSelect
            defaultSelected={["1", "3"]}
            label="Multiple Select Options"
            onChange={(values) => setSelectedValues(values)}
            options={multiOptions}
          />
          <p className="sr-only">
            Selected Values: {selectedValues.join(", ")}
          </p>
        </div>
      </div>
    </ComponentCard>
  );
}
