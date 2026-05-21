"use client";
import ComponentCard from "../../common/ComponentCard";
import Switch from "../switch/Switch";

export default function ToggleSwitch() {
  const handleSwitchChange = (_checked: boolean) => undefined;
  return (
    <ComponentCard title="Toggle switch input">
      <div className="flex gap-4">
        <Switch
          defaultChecked={true}
          label="Default"
          onChange={handleSwitchChange}
        />
        <Switch
          defaultChecked={true}
          label="Checked"
          onChange={handleSwitchChange}
        />
        <Switch disabled={true} label="Disabled" />
      </div>{" "}
      <div className="flex gap-4">
        <Switch
          color="gray"
          defaultChecked={true}
          label="Default"
          onChange={handleSwitchChange}
        />
        <Switch
          color="gray"
          defaultChecked={true}
          label="Checked"
          onChange={handleSwitchChange}
        />
        <Switch color="gray" disabled={true} label="Disabled" />
      </div>
    </ComponentCard>
  );
}
