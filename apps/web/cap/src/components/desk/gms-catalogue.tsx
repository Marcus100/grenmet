"use client";

import type { GmsCataloguePublic } from "@barrelsgd/api-client";
import { createContext, type ReactNode, useContext } from "react";

const GmsCatalogueContext = createContext<GmsCataloguePublic | null>(null);

/**
 * Hands the server-loaded GMS catalogue (hazard list, parishes, and the product
 * and colour rules, from `GET /api/v1/cap/gms-catalogue`) to the desk editor.
 * Desk pages render the editor only after the catalogue loaded; otherwise they
 * show `CatalogueUnavailable` instead, so the editor never guesses the rules.
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
    throw new Error("The GMS warning catalogue is not loaded for this page.");
  }
  return catalogue;
}
