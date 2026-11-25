import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { preferencesMock } from "@/test/admin-shell";

vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  preferencesMock()
);

import StudioLayout, { metadata, viewport } from "./layout";

describe("studio layout", () => {
  it("passes the page through: each area draws its own frame", () => {
    render(StudioLayout({ children: <p>Page</p> }));
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("boots the studio light, with the sticky top bar", () => {
    render(StudioLayout({ children: <p>Page</p> }));
    const script = document.querySelector("script");
    expect(script?.innerHTML).toContain('"theme_mode":"light"');
    expect(script?.innerHTML).toContain('"navbar_style":"sticky"');
  });

  it("is never indexed and links the install manifest and theme colour", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.manifest).toBe("/studio-manifest.webmanifest");
    expect(viewport.themeColor).toBe("#15006b");
  });
});
