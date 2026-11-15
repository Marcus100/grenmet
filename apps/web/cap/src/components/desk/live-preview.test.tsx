import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithGmsCatalogue as render } from "@/test/with-gms-catalogue";
import { LivePreview } from "./live-preview";

const CONTACT = "meteorology@gaa.gd; 1-473-444-4142";

describe("LivePreview contact line (#1365)", () => {
  it("renders the address in its own element with the same visible text", () => {
    render(
      <LivePreview
        areaDesc=""
        contact={CONTACT}
        description=""
        effective=""
        expires=""
        headline="Heavy rain"
        instruction=""
        senderName="Grenada Meteorological Service"
        severity="Severe"
        urgency="Immediate"
      />
    );
    const address = screen.getByText("meteorology@gaa.gd", {
      selector: "span",
    });
    expect(address.textContent).toBe("meteorology@gaa.gd");
    expect(address.closest("div")?.textContent).toBe(
      `Issued by Grenada Meteorological Service · ${CONTACT}`
    );
  });
});
