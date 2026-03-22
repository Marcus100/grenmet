"use client";
import type React from "react";
import { useState } from "react";

interface SwitchProps {
  color?: "blue" | "gray"; // Added prop to toggle color theme
  defaultChecked?: boolean;
  disabled?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
}

const Switch: React.FC<SwitchProps> = ({
  label,
  defaultChecked = false,
  disabled = false,
  onChange,
  color = "blue", // Default to blue color
}) => {
  const [isChecked, setIsChecked] = useState(defaultChecked);

  const handleToggle = () => {
    if (disabled) return;
    const newCheckedState = !isChecked;
    setIsChecked(newCheckedState);
    if (onChange) {
      onChange(newCheckedState);
    }
  };

  const switchColors =
    color === "blue"
      ? {
          background: isChecked
            ? "bg-brand-500 "
            : "bg-gray-200 dark:bg-white/10", // Blue version
          knob: isChecked
            ? "translate-x-full bg-white"
            : "translate-x-0 bg-white",
        }
      : {
          background: isChecked
            ? "bg-gray-800 dark:bg-white/10"
            : "bg-gray-200 dark:bg-white/10", // Gray version
          knob: isChecked
            ? "translate-x-full bg-white"
            : "translate-x-0 bg-white",
        };

  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-3 font-medium text-sm ${
        disabled ? "text-gray-400" : "text-gray-700 dark:text-gray-400"
      }`}
    >
      <input
        checked={isChecked}
        className="sr-only"
        disabled={disabled}
        onChange={handleToggle}
        type="checkbox"
      />
      <div className="relative">
        <div
          className={`block h-6 w-11 rounded-full transition duration-150 ease-linear ${
            disabled
              ? "pointer-events-none bg-gray-100 dark:bg-gray-800"
              : switchColors.background
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 transform rounded-full shadow-theme-sm duration-150 ease-linear ${switchColors.knob}`}
        />
      </div>
      {label}
    </label>
  );
};

export default Switch;
