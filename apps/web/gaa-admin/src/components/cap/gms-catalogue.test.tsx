import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import {
  GmsCatalogueBoundary,
  GmsCatalogueProvider,
  useGmsCatalogue,
} from "@/components/cap/gms-catalogue";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";

function Probe() {
  const catalogue = useGmsCatalogue();
  return <p>{catalogue.geocode_name}</p>;
}

describe("GMS catalogue provider and boundary", () => {
  it("gives the desk the catalogue it was provided", () => {
    render(
      <GmsCatalogueProvider catalogue={gmsCatalogueFixture}>
        <Probe />
      </GmsCatalogueProvider>
    );
    expect(screen.getByText("ISO3166-2:GD")).toBeInTheDocument();
  });

  it("shows a panel-sized message in place of a panel whose catalogue did not load, and the rest of the page renders", () => {
    render(
      <GmsCatalogueProvider catalogue={null}>
        <GmsCatalogueBoundary>
          <Probe />
        </GmsCatalogueBoundary>
        <p>Rest of the page</p>
      </GmsCatalogueProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The warning rules could not be loaded."
    );
    expect(screen.getByText("Rest of the page")).toBeInTheDocument();
  });
});
