"use client";

import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
}: QuantitySelectorProps) {
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        aria-label="Decrease quantity"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-gray-200 text-[var(--color-text-primary)] transition-colors hover:bg-gray-300 active:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={value <= min}
        onClick={handleDecrement}
        type="button"
      >
        <Minus className="h-5 w-5" />
      </button>

      <span className="w-10 text-center font-semibold text-[var(--color-text-primary)] text-xl">
        {value}
      </span>

      <button
        aria-label="Increase quantity"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-gray-200 text-[var(--color-text-primary)] transition-colors hover:bg-gray-300 active:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={value >= max}
        onClick={handleIncrement}
        type="button"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
