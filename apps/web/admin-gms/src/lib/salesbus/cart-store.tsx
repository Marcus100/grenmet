"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { CartItem, CaseType, PaymentType, Product } from "./types";
import { getCasePrice } from "./types";

interface CartContextType {
  addItem: (product: Product, quantity: number, caseType: CaseType) => void;
  clearCart: () => void;
  items: CartItem[];
  paymentType: PaymentType;
  removeItem: (itemId: string) => void;
  setPaymentType: (type: PaymentType) => void;
  totalItems: number;
  totalPrice: number;
  updateItemQuantity: (itemId: string, quantity: number) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");

  const addItem = useCallback(
    (product: Product, quantity: number, caseType: CaseType) => {
      const price = getCasePrice(product, caseType) * quantity;
      const newItem: CartItem = {
        id: `${product.id}-${caseType}-${Date.now()}`,
        productId: product.id,
        product,
        quantity,
        caseType,
        price,
      };

      setItems((prev) => [...prev, newItem]);
    },
    []
  );

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const updateItemQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const newPrice = getCasePrice(item.product, item.caseType) * quantity;
          return { ...item, quantity, price: newPrice };
        }
        return item;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        paymentType,
        addItem,
        removeItem,
        updateItemQuantity,
        clearCart,
        setPaymentType,
        totalItems,
        totalPrice,
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
