import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { GmsCatalogueProvider } from "@/components/desk/gms-catalogue";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";

function GmsCatalogueWrapper({ children }: { children: ReactNode }) {
  return (
    <GmsCatalogueProvider catalogue={gmsCatalogueFixture}>
      {children}
    </GmsCatalogueProvider>
  );
}

/**
 * Drop-in for RTL's `render` in tests of the warning desk. It wraps the UI in the
 * GMS catalogue provider the cap and wxproducts layouts supply, with the snapshot
 * fixture, and `rerender` keeps the provider.
 */
export function renderWithGmsCatalogue(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: GmsCatalogueWrapper, ...options });
}
