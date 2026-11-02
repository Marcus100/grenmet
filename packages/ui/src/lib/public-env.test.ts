import { runInThisContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onPublicEnv,
  PUBLIC_ENV_READY_EVENT,
  publicEnvResponse,
  publicEnvScript,
  readPublicEnv,
} from "./public-env";

/** Runs the served script body, as the browser would. */
function load(script: string) {
  runInThisContext(script);
}

// A minimal browser global: the script only sets a property and dispatches an event.
beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("readPublicEnv on the server", () => {
  it("reads the process environment at call time", () => {
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    expect(readPublicEnv("NEXT_PUBLIC_API_URL")).toBe(
      "https://api.example.test"
    );
  });
});

describe("publicEnvScript", () => {
  it("serves only the public keys and escapes markup", () => {
    const script = publicEnvScript({
      NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2",
      NEXT_PUBLIC_SITE_URL: "https://x.test/</script>",
      SECRET_KEY: "never",
    });
    expect(script).not.toContain("never");
    expect(script).not.toContain("</script>");
    load(script);
    expect(readPublicEnv("NEXT_PUBLIC_SENTRY_DSN")).toBe(
      "https://k@o1.ingest.sentry.io/2"
    );
    expect(readPublicEnv("NEXT_PUBLIC_SITE_URL")).toBe(
      "https://x.test/</script>"
    );
    expect(readPublicEnv("NEXT_PUBLIC_RELEASE")).toBeUndefined();
  });

  it("prefers the loaded settings over the process environment", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "from-process");
    expect(readPublicEnv("NEXT_PUBLIC_ENVIRONMENT")).toBe("from-process");
    load(publicEnvScript({ NEXT_PUBLIC_ENVIRONMENT: "staging" }));
    expect(readPublicEnv("NEXT_PUBLIC_ENVIRONMENT")).toBe("staging");
  });
});

describe("onPublicEnv", () => {
  it("waits for the settings, then runs once", () => {
    const callback = vi.fn();
    onPublicEnv(callback);
    expect(callback).not.toHaveBeenCalled();
    load(publicEnvScript({ NEXT_PUBLIC_RELEASE: "abc" }));
    window.dispatchEvent(new Event(PUBLIC_ENV_READY_EVENT));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("runs at once when the settings are already loaded", () => {
    load(publicEnvScript({}));
    const callback = vi.fn();
    onPublicEnv(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("publicEnvResponse", () => {
  it("is JavaScript with a short cache", async () => {
    const response = publicEnvResponse({ NEXT_PUBLIC_RELEASE: "abc" });
    expect(response.headers.get("Content-Type")).toContain(
      "application/javascript"
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await response.text()).toContain('"NEXT_PUBLIC_RELEASE":"abc"');
  });
});
