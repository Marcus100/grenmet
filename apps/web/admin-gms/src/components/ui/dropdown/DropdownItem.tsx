import Link from "next/link";
import type React from "react";

interface DropdownItemProps {
  baseClassName?: string;
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  onItemClick?: () => void;
  tag?: "a" | "button";
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  tag = "button",
  href,
  onClick,
  onItemClick,
  baseClassName = "block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  className = "",
  children,
}) => {
  const combinedClasses = `${baseClassName} ${className}`.trim();

  const handleClick = (event: React.MouseEvent) => {
    if (tag === "button") {
      event.preventDefault();
    }
    if (onClick) onClick();
    if (onItemClick) onItemClick();
  };

  if (tag === "a" && href) {
    return (
      <Link className={combinedClasses} href={href} onClick={handleClick}>
        {children}
      </Link>
    );
  }

  return (
    <button className={combinedClasses} onClick={handleClick}>
      {children}
    </button>
  );
};
