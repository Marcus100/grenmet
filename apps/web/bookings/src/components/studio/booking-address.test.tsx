import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));

import { BookingAddress } from "./booking-address";
import { CopyLinkButton } from "./copy-link-button";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  reportError.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("BookingAddress", () => {
  it("shows the public address with the origin when it is configured", () => {
    render(
      <BookingAddress
        orgSlug="sea-salt"
        publicSlug="sea-salt-spa"
        siteOrigin="https://bookings.barrels.gd"
      />
    );
    expect(screen.getByText("bookings.barrels.gd/sea-salt-spa")).toBeVisible();
    expect(screen.getByRole("link", { name: "View my page" })).toHaveAttribute(
      "href",
      "/sea-salt-spa"
    );
  });

  it("shows the path alone when no origin is configured", () => {
    render(
      <BookingAddress
        orgSlug="sea-salt"
        publicSlug="sea-salt-spa"
        siteOrigin={undefined}
      />
    );
    expect(screen.getByText("/sea-salt-spa")).toBeVisible();
  });
});

describe("CopyLinkButton", () => {
  it("copies the full address from the configured origin", async () => {
    render(
      <CopyLinkButton
        origin="https://bookings.barrels.gd"
        path="/sea-salt-spa"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://bookings.barrels.gd/sea-salt-spa"
      )
    );
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("copies one slash between the origin and the path when the origin ends in one", async () => {
    render(
      <CopyLinkButton
        origin="https://bookings.barrels.gd/"
        path="/sea-salt-spa"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://bookings.barrels.gd/sea-salt-spa"
      )
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain("//sea-salt-spa");
  });

  it("falls back to this page's origin when none is configured", async () => {
    render(<CopyLinkButton path="/sea-salt-spa" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/sea-salt-spa`
      )
    );
  });

  it("says what to do and reports when the browser refuses the copy", async () => {
    const refusal = new Error("denied");
    writeText.mockRejectedValue(refusal);
    render(<CopyLinkButton path="/sea-salt-spa" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(
      await screen.findByText(
        "Copying did not work here. Select the address above and copy it."
      )
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(refusal, "studio");
  });
});
