import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoogleAnalytics } from "./google-analytics";

const route = vi.hoisted(() => ({ pathname: "/news/private-customer" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/script", () => ({
  default: ({ onReady }: { onReady: () => void }) => (
    <button onClick={onReady} type="button">
      Load analytics
    </button>
  ),
}));
beforeEach(() => {
  window.dataLayer = [];
});
afterEach(cleanup);

it("loads nothing without a measurement ID", () => {
  render(<GoogleAnalytics environment="development" measurementId="" />);
  expect(screen.queryByText("Load analytics")).toBeNull();
  expect(window.dataLayer).toEqual([]);
});

it("disables automatic pageviews and publishes only a safe public section", () => {
  render(<GoogleAnalytics environment="staging" measurementId="G-TEST123" />);
  expect(window.dataLayer).toEqual([]);
  fireEvent.click(screen.getByText("Load analytics"));
  expect(window.dataLayer).toContainEqual([
    "config",
    "G-TEST123",
    expect.objectContaining({
      send_page_view: false,
      allow_google_signals: false,
    }),
  ]);
  expect(window.dataLayer).toContainEqual([
    "event",
    "page_view",
    expect.objectContaining({
      page_title: "news",
      page_referrer: "",
      debug_mode: true,
    }),
  ]);
  expect(JSON.stringify(window.dataLayer)).not.toContain("private-customer");
});
