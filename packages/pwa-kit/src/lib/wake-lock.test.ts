// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { holdScreenAwake } from "./wake-lock";

describe("holdScreenAwake", () => {
  function setVisibility(value: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
  }

  it("does nothing where the browser has no wake lock", () => {
    const release = holdScreenAwake({}, document);
    expect(() => release()).not.toThrow();
  });

  it("asks for a screen lock, asks again on return, and releases on cleanup", async () => {
    setVisibility("visible");
    const sentinel = { release: vi.fn(async () => undefined) };
    const request = vi.fn(async () => sentinel as unknown as WakeLockSentinel);
    const release = holdScreenAwake({ wakeLock: { request } }, document);
    expect(request).toHaveBeenCalledWith("screen");

    await Promise.resolve();
    release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("does not ask for a lock while the page is hidden", () => {
    setVisibility("hidden");
    const request = vi.fn(async () => ({}) as unknown as WakeLockSentinel);
    const release = holdScreenAwake({ wakeLock: { request } }, document);
    expect(request).not.toHaveBeenCalled();
    release();
  });

  it("survives a refused lock", async () => {
    setVisibility("visible");
    const request = vi.fn(() => Promise.reject(new Error("denied")));
    const release = holdScreenAwake({ wakeLock: { request } }, document);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => release()).not.toThrow();
  });
});
