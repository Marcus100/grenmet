"use client";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";
import Radio from "../input/Radio";

export default function RadioButtons() {
  const [selectedValue, setSelectedValue] = useState<string>("option2");

  const handleRadioChange = (value: string) => {
    setSelectedValue(value);
  };
  return (
    <ComponentCard title="Radio Buttons">
      <div className="flex flex-wrap items-center gap-8">
        <Radio
          checked={selectedValue === "option1"}
          id="radio1"
          label="Default"
          name="group1"
          onChange={handleRadioChange}
          value="option1"
        />
        <Radio
          checked={selectedValue === "option2"}
          id="radio2"
          label="Selected"
          name="group1"
          onChange={handleRadioChange}
          value="option2"
        />
        <Radio
          checked={selectedValue === "option3"}
          disabled={true}
          id="radio3"
          label="Disabled"
          name="group1"
          onChange={handleRadioChange}
          value="option3"
        />
      </div>
    </ComponentCard>
  );
}
