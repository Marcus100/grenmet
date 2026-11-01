import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/footer";

const PATH_START = /^M/;
const EMAIL_OR_BROWSER = /email or browser notifications/;
const NO_APP = /the app/;

describe("Footer", () => {
  it("opens with the alerts sign-up and emergency advice", () => {
    render(<Footer />);
    const alerts = screen.getByRole("region", {
      name: "Get official alerts first",
    });
    expect(
      within(alerts).getByRole("link", { name: "Get alerts" })
    ).toHaveAttribute("href", "/alerts/get-alerts");
    // Email and browser notifications are the channels offered; there is no app yet.
    expect(within(alerts).getByText(EMAIL_OR_BROWSER)).toBeVisible();
    expect(within(alerts).queryByText(NO_APP)).not.toBeInTheDocument();
    const emergency = screen.getByRole("region", { name: "In an emergency" });
    expect(emergency).toHaveTextContent("Call 911");
  });

  it("lists the published contact details as tap-to-call and email links", () => {
    render(<Footer />);
    expect(
      screen.getByRole("link", { name: "Main line +1 473 444 4142" })
    ).toHaveAttribute("href", "tel:+14734444142");
    expect(
      screen.getByRole("link", { name: "meteorology@gaa.gd" })
    ).toHaveAttribute("href", "mailto:meteorology@gaa.gd");
  });

  it("names each social network, with an icon or its name", () => {
    render(<Footer />);
    const list = screen.getByRole("list", { name: "GMS on social media" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "GMS on X",
      "GMS on Facebook",
      "GMS on Instagram",
      "GMS on YouTube",
      "GMS on LinkedIn",
      "GMS on WhatsApp",
    ]);
  });

  it("draws brand marks as hidden inline SVG, and keeps LinkedIn as text", () => {
    render(<Footer />);
    const list = screen.getByRole("list", { name: "GMS on social media" });
    const linkedin = within(list).getByRole("link", {
      name: "GMS on LinkedIn",
    });
    expect(linkedin).toHaveTextContent("LinkedIn");
    expect(linkedin.querySelector("svg")).toBeNull();
    const xLink = within(list).getByRole("link", { name: "GMS on X" });
    const svg = xLink.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("path")?.getAttribute("d")).toMatch(PATH_START);
    expect(xLink).not.toHaveTextContent("X");
  });

  it("aligns its rows to the page column like the header", () => {
    const { container } = render(<Footer />);
    // All three rows (alerts and emergency, link columns, legal line) sit in a
    // centred max-w-6xl box.
    const rows = [...container.querySelectorAll("footer .mx-auto.max-w-6xl")];
    expect(rows).toHaveLength(3);
  });

  it("keeps the four link columns and the legal row", () => {
    render(<Footer />);
    for (const name of [
      "Weather",
      "Alerts & marine",
      "Climate & services",
      "About",
    ]) {
      expect(screen.getByRole("navigation", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
