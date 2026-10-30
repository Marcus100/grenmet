import type { ReactNode } from "react";
import { GmsCatalogueProvider } from "@/components/cap/gms-catalogue";
import { loadGmsCatalogue } from "@/db/cap/queries";

/** The GMS warning catalogue is read once per page load for the warning desk components. */
export default async function WxproductsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const catalogue = await loadGmsCatalogue();
  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      {children}
    </GmsCatalogueProvider>
  );
}
