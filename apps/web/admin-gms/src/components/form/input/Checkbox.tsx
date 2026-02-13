import type React from "react";

interface CheckboxProps {
  label?: string;
  checked: boolean;
  className?: string;
  id?: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  id,
  onChange,
  className = "",
  disabled = false,
}) => {
  return (
    <label
      className={`group flex cursor-pointer items-center space-x-3 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <div className="relative h-5 w-5">
        <input
          checked={checked}
          className={`h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 checked:border-transparent checked:bg-brand-500 disabled:opacity-60 dark:border-gray-700 ${className}`}
          disabled={disabled}
          id={id}
          onChange={(e) => onChange(e.target.checked)}
          type="checkbox"
        />
        {checked && (
          <svg
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform"
            fill="none"
            height="14"
            viewBox="0 0 14 14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.94437"
            />
          </svg>
        )}
        {disabled && (
          <svg
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform"
            fill="none"
            height="14"
            viewBox="0 0 14 14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
              stroke="#E4E7EC"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.33333"
            />
          </svg>
        )}
      </div>
      {label && (
        <span className="font-medium text-gray-800 text-sm dark:text-gray-200">
          {label}
        </span>
      )}
    </label>
  );
};

export default Checkbox;
