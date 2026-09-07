// @vitest-environment jsdom
import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import { cleanup, render } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
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
  usePostHog: () => null,
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
    posthog.init.mockImplementation(() => {
      posthog.__loaded = true;
    });
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
  });
});
