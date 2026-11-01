"use client";

import type { GmsCataloguePublic } from "@barrelsgd/api-client";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { reportError } from "@/lib/report-error";

const GmsCatalogueContext = createContext<GmsCataloguePublic | null>(null);

/** The catalogue could not be loaded for this page, so the panel that needs it cannot draw. */
export class GmsCatalogueUnavailableError extends Error {
  constructor() {
    super("The GMS warning catalogue is not loaded for this page.");
    this.name = "GmsCatalogueUnavailableError";
  }
}

/**
 * Hands the server-loaded GMS catalogue (hazard list, parishes, and the product
 * and colour rules) to the warning desk. The cap and wxproducts layouts load it
 * and pass `null` when the load fails, so the rest of each page still renders.
 */
export function GmsCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: GmsCataloguePublic | null;
  children: ReactNode;
}) {
  return (
    <GmsCatalogueContext.Provider value={catalogue}>
      {children}
    </GmsCatalogueContext.Provider>
  );
}

/** The catalogue, or a thrown error that GmsCatalogueBoundary turns into a panel-level message. */
export function useGmsCatalogue(): GmsCataloguePublic {
  const catalogue = useContext(GmsCatalogueContext);
  if (catalogue === null) {
    throw new GmsCatalogueUnavailableError();
  }
  return catalogue;
}

function CatalogueUnavailable({ error }: FallbackProps) {
  useEffect(() => {
    reportError(error, "gms-catalogue");
  }, [error]);
  return (
    <div
      className="rounded-md border border-gm-border bg-gm-surface p-4 text-body-sm text-gm-text-secondary"
      role="alert"
    >
      <p className="font-medium text-gm-text-primary">
        The warning rules could not be loaded.
      </p>
      <p>
        This panel needs the GMS hazard list and colour rules. The rest of the
        page still works. Reload the page to try again.
      </p>
    </div>
  );
}

/** Shows a panel-sized message in place of any warning-desk panel that needs the catalogue. */
export function GmsCatalogueBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={CatalogueUnavailable}>
      {children}
    </ErrorBoundary>
  );
}
