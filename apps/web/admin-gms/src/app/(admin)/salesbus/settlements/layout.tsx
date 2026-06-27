"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/salesbus/layout";
import { useCart } from "@/lib/salesbus/cart-store";

export default function SettlementsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { totalItems } = useCart();

  return <AppShell cartItemCount={totalItems}>{children}</AppShell>;
}
