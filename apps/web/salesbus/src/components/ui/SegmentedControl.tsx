"use client";

interface SegmentOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  onChange: (value: string) => void;
  options: SegmentOption[];
  value: string;
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
                  ? "bg-foreground text-background"
                  : "border border-gray-300 bg-transparent text-muted-foreground hover:border-gray-400 active:bg-gray-100"
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
                ? "bg-foreground text-background"
                : "bg-transparent text-muted-foreground hover:text-foreground active:bg-gray-300"
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
