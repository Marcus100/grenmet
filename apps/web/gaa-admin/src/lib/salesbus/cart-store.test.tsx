import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CartProvider, useCart } from "./cart-store";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

const PEN = { itemId: "i-1", sku: "PEN-1", name: "Pen", unit: "box" };

describe("requisition cart", () => {
  it("lists each item once and accumulates repeat adds", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(PEN, 2));
    act(() => result.current.addItem(PEN, 3));
    act(() =>
      result.current.addItem(
        { itemId: "i-2", sku: "PAP-1", name: "Paper", unit: "ream" },
        1
      )
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toMatchObject({
      itemId: "i-1",
      quantity: 5,
    });
    expect(result.current.totalItems).toBe(6);
  });

  it("updates, removes and clears", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(PEN, 1));

    act(() => result.current.updateItemQuantity("i-1", 7));
    expect(result.current.items[0]?.quantity).toBe(7);

    act(() => result.current.removeItem("i-1"));
    expect(result.current.items).toHaveLength(0);

    act(() => result.current.addItem(PEN, 1));
    act(() => result.current.clearCart());
    expect(result.current.totalItems).toBe(0);
  });

  it("refuses to be used outside its provider", () => {
    expect(() => renderHook(() => useCart())).toThrow(
      "useCart must be used within a CartProvider"
    );
  });
});
