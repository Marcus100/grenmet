import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import Page from "./page";

const LIVE_REGISTER = /live hourly observation register for station 78958/;
const DRAFT_ONLY = /Operational transmission is not available/;
const PROTOTYPE = /prototype/i;
const SAMPLE_OBSERVATIONS = /sample observations/i;

it("links to the four product desks and points to the live hourly register", () => {
  render(<Page />);
  const desks = within(
    screen.getByRole("navigation", { name: "Weather product desks" })
  );
  for (const [name, href] of [
    ["Forecasts", "/wxproducts/fcsts"],
    ["NHC Products", "/wxproducts/nhc"],
    ["Alerts", "/wxproducts/alerts"],
    ["Aviation", "/wxproducts/aviation"],
  ]) {
    expect(
      desks.getByRole("link", { name: new RegExp(`^${name}`) })
    ).toHaveAttribute("href", href);
  }
  expect(desks.getAllByRole("link")).toHaveLength(4);
  const register = within(
    screen.getByRole("region", { name: "Hourly register (wxRegister)" })
  );
  expect(register.getByText(LIVE_REGISTER)).toBeInTheDocument();
  expect(
    register.getByRole("link", { name: "Open the hourly register" })
  ).toHaveAttribute("href", "/wxproducts/hourly");
  expect(screen.getByText(DRAFT_ONLY)).toBeInTheDocument();
});

it("no longer calls the hourly register a prototype or sample", () => {
  const { container } = render(<Page />);
  expect(container).not.toHaveTextContent(PROTOTYPE);
  expect(container).not.toHaveTextContent(SAMPLE_OBSERVATIONS);
});
