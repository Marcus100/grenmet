"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { CartItem } from "./types";

interface CartContextType {
  addItem: (item: Omit<CartItem, "quantity">, quantity: number) => void;
  clearCart: () => void;
  items: CartItem[];
  removeItem: (itemId: string) => void;
  totalItems: number;
  updateItemQuantity: (itemId: string, quantity: number) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, quantity: number) => {
      setItems((prev) => {
        const existing = prev.find((entry) => entry.itemId === item.itemId);
        if (!existing) return [...prev, { ...item, quantity }];
        // A requisition lists each item once, so repeat adds accumulate.
        return prev.map((entry) =>
          entry.itemId === item.itemId
            ? { ...entry, quantity: entry.quantity + quantity }
            : entry
        );
      });
    },
    []
  );

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.itemId !== itemId));
  }, []);

  const updateItemQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateItemQuantity,
        clearCart,
        totalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
