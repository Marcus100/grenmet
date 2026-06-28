"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  cartItemCount?: number;
  userName?: string;
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Header({
  userName = "Bradley Andrews",
  cartItemCount = 0,
}: HeaderProps) {
  const initials = getInitials(userName);

  return (
    <header className="flex items-center justify-between border-gray-100 border-b bg-card px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gm-blue font-semibold text-sm text-white sm:h-12 sm:w-12 sm:text-base">
          {initials}
        </div>
        <span className="font-medium text-base text-foreground sm:text-lg">
          {userName}
        </span>
      </div>

      <Link
        className="-mr-3 flex min-h-12 touch-manipulation items-center gap-2 rounded-lg px-3 text-muted-foreground transition-colors hover:text-foreground active:bg-gray-100"
        href="/salesbus/sales/cart"
      >
        <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
        <span className="font-medium text-sm sm:text-base">Cart</span>
        {cartItemCount > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-2 font-semibold text-white text-xs">
            {cartItemCount}
          </span>
        )}
      </Link>
    </header>
  );
}
