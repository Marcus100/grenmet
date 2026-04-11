"use client";

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  variant?: "default" | "pill";
}

export function SegmentedControl({
  options,
  value,
  onChange,
  variant = "default",
}: SegmentedControlProps) {
  if (variant === "pill") {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              className={`min-h-12 touch-manipulation rounded-full px-5 py-3 font-semibold text-sm transition-colors ${
                isSelected
                  ? "bg-[var(--color-text-primary)] text-white"
                  : "border border-gray-300 bg-transparent text-[var(--color-text-secondary)] hover:border-gray-400 active:bg-gray-100"
              }
              `}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex rounded-lg bg-gray-200 p-1">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            className={`min-h-12 flex-1 touch-manipulation rounded-md px-4 py-3.5 font-semibold text-sm uppercase tracking-wide transition-colors ${
              isSelected
                ? "bg-[var(--color-text-primary)] text-white"
                : "bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] active:bg-gray-300"
            }
            `}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
