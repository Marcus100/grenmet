import type { GmsCataloguePublic } from "@barrelsgd/api-client";
import type { ReactNode } from "react";
import { GmsCatalogueProvider } from "@/components/cap/gms-catalogue";
import { loadGmsCatalogue } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

/**
 * Loads the GMS warning catalogue for the warning desk. If the load fails, the page
 * still renders: only the panels that need the catalogue show an error.
 */
export default async function WxproductsLayout({
  children,
}: {
  children: ReactNode;
}) {
  let catalogue: GmsCataloguePublic | null = null;
  try {
    catalogue = await loadGmsCatalogue();
  } catch (error) {
    reportError(error, "gms-catalogue-layout");
  }
  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      {children}
    </GmsCatalogueProvider>
  );
}
