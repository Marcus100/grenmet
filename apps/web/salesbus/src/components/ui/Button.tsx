"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[var(--color-primary)] text-white
    hover:bg-[var(--color-primary-dark)]
    active:bg-[var(--color-primary-dark)]
  `,
  secondary: `
    bg-[var(--color-surface)] text-[var(--color-text-primary)]
    border border-gray-300
    hover:bg-gray-50
    active:bg-gray-100
  `,
  ghost: `
    bg-transparent text-[var(--color-text-secondary)]
    hover:bg-gray-100 hover:text-[var(--color-text-primary)]
    active:bg-gray-200
  `,
  outline: `
    bg-transparent text-[var(--color-primary)]
    border-2 border-[var(--color-primary)]
    hover:bg-[var(--color-primary)] hover:text-white
    active:bg-[var(--color-primary-dark)]
  `,
};

// All sizes enforce minimum 48px height for touch targets
const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2.5 text-sm min-h-12",
  md: "px-5 py-3 text-base min-h-12",
  lg: "px-6 py-3.5 text-lg min-h-14",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex touch-manipulation items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      disabled={disabled}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
