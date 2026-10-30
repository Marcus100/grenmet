"use client";

import type { GmsCataloguePublic } from "@barrelsgd/api-client";
import { createContext, type ReactNode, useContext } from "react";

const GmsCatalogueContext = createContext<GmsCataloguePublic | null>(null);

/**
 * Hands the server-loaded GMS catalogue (hazard list, parishes, and the product
 * and colour rules) to the warning desk. The layouts under `cap/` and
 * `wxproducts/` load it with `loadGmsCatalogue`.
 */
export function GmsCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: GmsCataloguePublic;
  children: ReactNode;
}) {
  return (
    <GmsCatalogueContext.Provider value={catalogue}>
      {children}
    </GmsCatalogueContext.Provider>
  );
}

export function useGmsCatalogue(): GmsCataloguePublic {
  const catalogue = useContext(GmsCatalogueContext);
  if (catalogue === null) {
    throw new Error("useGmsCatalogue must be used inside GmsCatalogueProvider");
  }
  return catalogue;
}
