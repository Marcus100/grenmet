import type React from "react";

interface RadioProps {
  checked: boolean; // Whether the radio button is checked
  className?: string; // Optional custom classes for styling
  id: string; // Unique ID for the radio button
  label: string; // Label text for the radio button
  name: string; // Group name for the radio button
  onChange: (value: string) => void; // Handler for when the radio button is toggled
  value: string; // Value of the radio button
}

const RadioSm: React.FC<RadioProps> = ({
  id,
  name,
  value,
  checked,
  label,
  onChange,
  className = "",
}) => {
  return (
    <label
      className={`flex cursor-pointer select-none items-center text-gray-500 text-sm dark:text-gray-400 ${className}`}
      htmlFor={id}
    >
      <span className="relative">
        {/* Hidden Input */}
        <input
          checked={checked}
          className="sr-only"
          id={id}
          name={name}
          onChange={() => onChange(value)}
          type="radio"
          value={value}
        />
        {/* Styled Radio Circle */}
        <span
          className={`mr-2 flex h-4 w-4 items-center justify-center rounded-full border ${
            checked
              ? "border-brand-500 bg-brand-500"
              : "border-gray-300 bg-transparent dark:border-gray-700"
          }`}
        >
          {/* Inner Dot */}
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              checked ? "bg-white" : "bg-white dark:bg-[#1e2636]"
            }`}
          />
        </span>
      </span>
      {label}
    </label>
  );
};

export default RadioSm;
