"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout";
import { useCart } from "@/src/lib/cart-store";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  const { totalItems } = useCart();

  return <AppShell cartItemCount={totalItems}>{children}</AppShell>;
}
