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
    bg-gm-blue text-white
    hover:bg-gm-navy
    active:bg-gm-navy
  `,
  secondary: `
    bg-card text-foreground
    border border-gray-300
    hover:bg-gray-50
    active:bg-gray-100
  `,
  ghost: `
    bg-transparent text-muted-foreground
    hover:bg-gray-100 hover:text-foreground
    active:bg-gray-200
  `,
  outline: `
    bg-transparent text-gm-blue
    border-2 border-gm-blue
    hover:bg-gm-blue hover:text-white
    active:bg-gm-navy
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
      className={`inline-flex touch-manipulation items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gm-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]}
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
