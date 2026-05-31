"use client";
import { Switch } from "@grenmet/ui/components/ui/switch";
import ComponentCard from "../../common/ComponentCard";

export default function ToggleSwitch() {
  return (
    <ComponentCard title="Toggle switch input">
      <div className="flex gap-6">
        <label
          className="flex cursor-pointer items-center gap-3 font-medium text-gray-700 text-sm"
          htmlFor="sw-default"
        >
          <Switch defaultChecked id="sw-default" />
          Default
        </label>
        <label
          className="flex cursor-pointer items-center gap-3 font-medium text-gray-700 text-sm"
          htmlFor="sw-checked"
        >
          <Switch defaultChecked id="sw-checked" />
          Checked
        </label>
        <label
          className="flex cursor-not-allowed items-center gap-3 font-medium text-gray-400 text-sm"
          htmlFor="sw-disabled"
        >
          <Switch disabled id="sw-disabled" />
          Disabled
        </label>
      </div>
    </ComponentCard>
  );
}
