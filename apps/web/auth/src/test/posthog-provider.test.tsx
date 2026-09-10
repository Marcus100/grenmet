// @vitest-environment jsdom
import {
  filterAnalyticsEvent,
  PostHogProvider,
} from "@barrelsgd/ui/components/posthog-provider";
import { cleanup, render } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  capture: vi.fn(),
}));

const sdkPaths = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const { resolve } = await import("node:path");
  const require = createRequire(resolve("../../../packages/ui/package.json"));
  return {
    core: require.resolve("posthog-js"),
    react: require.resolve("posthog-js/react"),
  };
});

vi.mock(sdkPaths.core, () => ({ default: posthog }));
vi.mock(sdkPaths.react, () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
  usePostHog: () => posthog,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function showProvider(apiKey = "test-key") {
  return render(
    <StrictMode>
      <PostHogProvider apiHost="https://example.com" apiKey={apiKey}>
        <span>Sign in</span>
      </PostHogProvider>
    </StrictMode>
  );
}

describe("shared PostHog initialization", () => {
  beforeEach(() => {
    posthog.__loaded = false;
    posthog.init.mockReset();
    posthog.capture.mockReset();
    posthog.init.mockImplementation(
      (_key: string, options: { loaded: () => void }) => {
        posthog.__loaded = true;
        options.loaded();
      }
    );
  });

  afterEach(cleanup);

  it("initializes once across Strict Mode effects and provider remounts", () => {
    const view = showProvider();
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith(
      "test-key",
      expect.objectContaining({
        api_host: "https://example.com",
        capture_pageview: false,
        autocapture: false,
        capture_exceptions: false,
        disable_session_recording: true,
        person_profiles: "never",
      })
    );
    view.unmount();
    showProvider();
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });

  it("reuses an SDK instance that was already initialized", () => {
    posthog.__loaded = true;
    showProvider();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("does not initialize when analytics is disabled", () => {
    showProvider("");
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("captures the initial page only after SDK initialization", () => {
    showProvider();
    expect(posthog.capture).toHaveBeenCalledWith("$pageview", {
      page_section: "home",
    });
  });
});

describe("analytics privacy", () => {
  it("drops content capture and strips URL, draft, identity and person properties", () => {
    expect(
      filterAnalyticsEvent({
        uuid: "test",
        event: "$autocapture",
        properties: {},
      })
    ).toBeNull();
    const result = filterAnalyticsEvent({
      uuid: "test",
      event: "$pageview",
      $set: { email: "private@example.test" },
      properties: {
        token: "public-project-key",
        distinct_id: "anonymous-id",
        $current_url: "https://example.test/?token=secret",
        $referrer: "https://example.test/?email=private",
        draft: "unpublished warning",
        email: "private@example.test",
      },
    });
    expect(result).toEqual({
      uuid: "test",
      event: "$pageview",
      timestamp: undefined,
      properties: {
        page_section: "other",
        token: "public-project-key",
        distinct_id: "anonymous-id",
        $lib: undefined,
        $lib_version: undefined,
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  });
});
