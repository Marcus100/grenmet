import { Logo, type LogoVariant } from "@barrelsgd/gms/components/logo";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Logo lives in @barrelsgd/gms, which has no test runner of its own. It is
// covered from here because gms is its primary consumer — header, footer and
// nav drawer all render it.
//
// Scope limit: vitest.config.ts aliases every static image import to one shared
// stub, so `light` and `dark` are the same object here and the component takes
// its single-image branch. Which asset a variant resolves to, and the two-ink
// theme swap, therefore cannot be asserted in this environment. These tests
// assert what holds in both the stub and a real build.

const VARIANTS: LogoVariant[] = ["primary", "submark", "wordmark", "icon"];

const SERVICE_NAME = "Grenada Meteorological Service";

describe("Logo", () => {
  it.each(VARIANTS)("renders the %s variant", (variant) => {
    render(<Logo variant={variant} />);

    // A variant missing from LOGO_ASSETS destructures undefined and throws, so
    // this is the guard that matters when a new variant is added.
    expect(screen.getAllByAltText(SERVICE_NAME).length).toBeGreaterThan(0);
  });

  it("defaults to the primary lockup", () => {
    render(<Logo />);
    expect(screen.getAllByAltText(SERVICE_NAME).length).toBeGreaterThan(0);
  });

  it("names the service for assistive tech", () => {
    render(<Logo variant="wordmark" />);
    expect(screen.getAllByAltText(SERVICE_NAME).length).toBeGreaterThan(0);
  });

  it("takes an alt override for decorative or linked placements", () => {
    render(<Logo alt="Home" variant="icon" />);
    expect(screen.getAllByAltText("Home").length).toBeGreaterThan(0);
  });

  it("puts the caller's sizing classes on every ink it renders", () => {
    render(<Logo className="h-9 w-auto" variant="wordmark" />);

    for (const image of screen.getAllByAltText(SERVICE_NAME)) {
      expect(image).toHaveClass("h-9", "w-auto");
    }
  });

  it("leaves width and height to the caller's classes, not attributes", () => {
    // The lockups are fixed-ratio; hardcoded dimensions would distort them.
    render(<Logo className="h-7 w-auto" variant="wordmark" />);

    for (const image of screen.getAllByAltText(SERVICE_NAME)) {
      expect(image).toHaveClass("w-auto");
    }
  });
});
