"use client";

import { useState } from "react";
import { ProductCard } from "@/components/sales";
import { ProductDetailModal } from "@/components/sales/ProductDetailModal";
import { SearchBar } from "@/components/ui";
import { products } from "@/src/lib/mock-data";
import type { Product } from "@/src/lib/types";

export default function SalesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAddProduct = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      <SearchBar
        onSearch={setSearchQuery}
        placeholder="Search products..."
        value={searchQuery}
      />

      {/* Product list - single column on mobile, 2 columns on tablet landscape */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 landscape:grid-cols-2">
        {filteredProducts.map((product) => (
          <ProductCard
            key={product.id}
            onAdd={handleAddProduct}
            product={product}
          />
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="py-12 text-center text-[var(--color-text-secondary)]">
          <p className="text-base sm:text-lg">
            No products found matching &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      <ProductDetailModal
        isOpen={selectedProduct !== null}
        onClose={handleCloseModal}
        product={selectedProduct}
      />
    </div>
  );
}
