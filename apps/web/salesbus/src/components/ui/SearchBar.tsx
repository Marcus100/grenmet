"use client";

import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";

interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onSearch?: (value: string) => void;
}

export function SearchBar({
  placeholder = "Search",
  className = "",
  onChange,
  onSearch,
  ...props
}: SearchBarProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onSearch?.(e.target.value);
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        className="min-h-12 w-full touch-manipulation rounded-lg border-none bg-[var(--color-surface)] py-3.5 pr-4 pl-12 text-[var(--color-text-primary)] text-base transition-shadow placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        onChange={handleChange}
        placeholder={placeholder}
        type="search"
        {...props}
      />
    </div>
  );
}
