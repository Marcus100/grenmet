import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShareActions, whatsappHref } from "./share-actions";

const HTTPS_SCHEME = /https:\/\//u;
const URL_FOR_EVENT = "https://events.barrels.gd/events/steel-pan-night";

describe("event share links", () => {
  it("puts the full https address of the event in the WhatsApp text", () => {
    const href = whatsappHref("Steel Pan Night", URL_FOR_EVENT);
    const text = new URL(href).searchParams.get("text");

    expect(text).toBe(`Steel Pan Night ${URL_FOR_EVENT}`);
    expect(text).toMatch(HTTPS_SCHEME);
  });

  it("renders the WhatsApp button with the same full address", () => {
    render(
      <ShareActions
        icsHref="/events/steel-pan-night/ics"
        title="Steel Pan Night"
        url={URL_FOR_EVENT}
      />
    );

    const link = screen.getByRole("link", { name: "WhatsApp" });
    expect(link.getAttribute("href")).toBe(
      whatsappHref("Steel Pan Night", URL_FOR_EVENT)
    );
    expect(
      new URL(link.getAttribute("href") ?? "").searchParams.get("text")
    ).toContain(URL_FOR_EVENT);
  });
});
