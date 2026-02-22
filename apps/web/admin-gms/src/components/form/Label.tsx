import type { FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface LabelProps {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

const Label: FC<LabelProps> = ({ htmlFor, children, className }) => {
  return (
    <label
      className={twMerge(
        // Default classes that apply by default
        "mb-1.5 block font-medium text-gray-700 text-sm dark:text-gray-400",

        // User-defined className that can override the default margin
        className
      )}
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
};

export default Label;
