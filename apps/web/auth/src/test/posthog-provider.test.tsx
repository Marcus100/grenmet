// @vitest-environment jsdom
import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import {
  analyticsAllowedOnPath,
  CONSENT_KEY,
  CONSENT_MS,
  readConsent,
  sanitizeEvent,
} from "@barrelsgd/ui/lib/analytics-policy";
import {
  captureEvent,
  capturePage,
  filterAnalyticsEvent,
  startAnalytics,
  stopAnalytics,
} from "@barrelsgd/ui/lib/analytics-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/results", configured: true }));
const posthog = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
}));
const sdkPath = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const { resolve } = await import("node:path");
  return createRequire(resolve("../../../packages/ui/package.json")).resolve(
    "posthog-js"
  );
});
vi.mock(sdkPath, () => ({ default: posthog }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@barrelsgd/ui/lib/analytics-policy", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@barrelsgd/ui/lib/analytics-policy")
  >()),
  configForOrigin: () => (state.configured ? config : null),
}));
const config = {
  app: "elections",
  environment: "development",
  origin: "http://localhost:3007",
  release: "test",
  ga4: "G-TEST123",
  posthog: { key: "test", host: "https://us.i.posthog.com" },
} as const;
function accept() {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ value: "accepted", expires: Date.now() + CONSENT_MS })
  );
}
function show() {
  return render(
    <StrictMode>
      <PostHogProvider app="elections">
        <p>Content</p>
      </PostHogProvider>
    </StrictMode>
  );
}
beforeEach(() => {
  stopAnalytics();
  localStorage.clear();
  // biome-ignore lint/suspicious/noDocumentCookie: test browser cookie cleanup.
  document.cookie = "_ga=; Max-Age=0";
  posthog.__loaded = false;
  vi.clearAllMocks();
  state.configured = true;
  state.pathname = "/results";
  posthog.init.mockImplementation(() => {
    posthog.__loaded = true;
  });
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: false,
    configurable: true,
  });
});
afterEach(cleanup);
it("collects Events discovery pages without exposing member or organiser routes", async () => {
  for (const path of [
    "/",
    "/events",
    "/events/public-slug",
    "/groups/public-slug",
  ]) {
    expect(analyticsAllowedOnPath("events", path)).toBe(true);
  }
  for (const path of [
    "/messages/private",
    "/network",
    "/people/member",
    "/saved",
    "/sign-in",
    "/dash/events/private",
  ]) {
    expect(analyticsAllowedOnPath("events", path)).toBe(false);
  }
  accept();
  state.pathname = "/events/public-slug";
  const view = render(
    <PostHogProvider app="events">Discovery</PostHogProvider>
  );
  await waitFor(() =>
    expect(document.getElementById("optional-google-analytics")).not.toBeNull()
  );
  state.pathname = "/messages/private";
  view.rerender(
    <PostHogProvider app="events">Private messages</PostHogProvider>
  );
  expect(screen.getByText("Private messages")).toBeTruthy();
  expect(screen.queryByText("Privacy settings")).toBeNull();
  expect(document.getElementById("optional-google-analytics")).toBeNull();
  expect(window.dataLayer).toHaveLength(0);
});
it("sends Google commands in the documented Arguments format and retains the queue on withdrawal", async () => {
  accept();
  await startAnalytics({ ...config, posthog: null });
  capturePage("/results", "results");
  const queue = window.dataLayer;
  expect(queue).toBeDefined();
  const commands = queue?.map((entry) => {
    expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
    return Array.from(entry as IArguments);
  });
  expect(commands?.[0]).toMatchObject([
    "consent",
    "default",
    { analytics_storage: "granted", ad_storage: "denied" },
  ]);
  expect(commands).toContainEqual([
    "event",
    "page_view",
    expect.objectContaining({
      send_to: "G-TEST123",
      page_location: "http://localhost:3007/results",
    }),
  ]);
  stopAnalytics();
  expect(window.dataLayer).toBe(queue);
  expect(queue).toHaveLength(0);
});

it("keeps GA available if the optional PostHog SDK fails", async () => {
  accept();
  posthog.init.mockImplementation(() => {
    throw new Error("SDK unavailable");
  });
  posthog.capture.mockImplementationOnce(() => {
    throw new Error("capture unavailable");
  });
  await startAnalytics(config);
  expect(document.getElementById("optional-google-analytics")).not.toBeNull();
  capturePage("/results", "results");
  expect(
    window.dataLayer?.some(
      (entry) => Array.from(entry as IArguments)[0] === "event"
    )
  ).toBe(true);
});
it("does not load or persist optional identifiers before consent; decline stays off", async () => {
  show();
  expect(screen.getByText("Content")).toBeTruthy();
  expect(posthog.init).not.toHaveBeenCalled();
  expect(document.querySelector("script")).toBeNull();
  expect(localStorage.length).toBe(0);
  fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
  expect(readConsent()).toBe("declined");
  expect(posthog.init).not.toHaveBeenCalled();
});
it("accepts once, deduplicates strict effects, and stops capture on withdrawal", async () => {
  const view = show();
  fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
  await waitFor(() => expect(posthog.init).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(1));
  await startAnalytics(config);
  capturePage("/results", "results");
  expect(posthog.capture).toHaveBeenCalledTimes(1);
  state.pathname = "/sources";
  view.rerender(
    <PostHogProvider app="elections">
      <p>Content</p>
    </PostHogProvider>
  );
  await waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));
  localStorage.setItem("ph_test", "identifier");
  // biome-ignore lint/suspicious/noDocumentCookie: test browser cookie cleanup.
  document.cookie = "_ga=identifier";
  fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  captureEvent("csv_download_clicked", {});
  expect(posthog.capture).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("ph_test")).toBeNull();
  expect(document.cookie).not.toContain("identifier");
  expect(document.getElementById("optional-google-analytics")).toBeNull();
});
it("honours browser opt-out, expiry, missing mappings and staff mounts", async () => {
  accept();
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: true,
    configurable: true,
  });
  await startAnalytics(config);
  expect(posthog.init).not.toHaveBeenCalled();
  expect(readConsent()).toBe("declined");
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: false,
    configurable: true,
  });
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ value: "accepted", expires: Date.now() - 1 })
  );
  expect(readConsent()).toBeNull();
  state.configured = false;
  show();
  expect(posthog.init).not.toHaveBeenCalled();
  cleanup();
  render(
    <PostHogProvider apiHost="https://us.i.posthog.com" apiKey="legacy">
      Sign in
    </PostHogProvider>
  );
  expect(screen.queryByText("Privacy settings")).toBeNull();
  expect(posthog.init).not.toHaveBeenCalled();
});
it("rejects unknown events and sensitive properties and scrubs provider-added fields", async () => {
  expect(
    sanitizeEvent("elections", "prediction_share_completed", {
      method: "clipboard",
      prediction: "NDC",
    })
  ).toBeNull();
  expect(sanitizeEvent("elections", "workflow_completed", {})).toBeNull();
  expect(sanitizeEvent("gms", "year_selected", { year: "2022" })).toBeNull();
  accept();
  await startAnalytics(config);
  const result = filterAnalyticsEvent({
    uuid: "test",
    event: "csv_download_clicked",
    properties: {
      reviewed: {},
      token: "public",
      distinct_id: "anon",
      email: "private@example.test",
      $current_url: "https://example.test/?secret=private",
      $set: { name: "private" },
    },
  });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(result?.properties).toMatchObject({
    app: "elections",
    schema_version: 1,
  });
  expect(
    filterAnalyticsEvent({ uuid: "x", event: "$autocapture", properties: {} })
  ).toBeNull();
});
it("asks once in a popup, then leaves a small button to change the choice", async () => {
  show();
  const dialog = await screen.findByRole("dialog", { name: "Your privacy" });
  expect(dialog.className).toContain("fixed");
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
  expect(screen.getByRole("dialog", { name: "Your privacy" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Keep my current choice (declined)" })
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  cleanup();

  // A returning visitor with a saved choice sees only the button.
  accept();
  show();
  expect(
    await screen.findByRole("button", { name: "Privacy settings" })
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  cleanup();

  // No optional analytics on this site: nothing to ask, nothing shown.
  state.configured = false;
  localStorage.clear();
  show();
  await waitFor(() => expect(screen.getByText("Content")).toBeTruthy());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Privacy settings" })).toBeNull();
});
