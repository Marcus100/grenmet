// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppDirectory, findRequestedApp } from "./app-directory";

describe("AppDirectory", () => {
  it("groups apps under GAA, GMS and Barrels", () => {
    render(<AppDirectory />);
    for (const label of ["GAA", "GMS", "Barrels"]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("GAA Admin")).toBeInTheDocument();
    expect(screen.getByText("Weather")).toBeInTheDocument();
    expect(screen.getByText("Signal")).toBeInTheDocument();
  });

  it("lists apps without links on sign-in pages", () => {
    render(<AppDirectory />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("links only the apps that have a URL", () => {
    render(<AppDirectory hrefs={{ admin: "https://admin.example.gd" }} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://admin.example.gd");
    expect(
      within(links[0] as HTMLElement).getByText("GAA Admin")
    ).toBeInTheDocument();
  });

  it("highlights the app that requested sign-in", () => {
    render(<AppDirectory requestedApp="admin-gms" />);
    const current = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(
      within(current[0] as HTMLElement).getByText("GAA Admin")
    ).toBeInTheDocument();
  });
});

describe("findRequestedApp", () => {
  it("matches aliases case-insensitively", () => {
    expect(findRequestedApp(" GMS ")).toBe("weather");
    expect(findRequestedApp("gaa-admin")).toBe("admin");
  });

  it("returns null for unknown or empty names", () => {
    expect(findRequestedApp("localhost")).toBeNull();
    expect(findRequestedApp(null)).toBeNull();
  });
});
