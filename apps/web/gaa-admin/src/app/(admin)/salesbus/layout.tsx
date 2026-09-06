import type { ReactNode } from "react";
import { CartProvider } from "@/lib/salesbus/cart-store";

/** Scopes the SalesBus cart context to the /salesbus subsection. */
export default function SalesbusLayout({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
