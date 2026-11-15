// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSoundPlayer,
  holdScreenAwake,
  TONES,
  type ToneContext,
  vibrate,
} from "@/lib/gate-feedback";

interface FakeNode {
  connect: (target: unknown) => void;
  frequency: { value: number };
  gain: {
    setValueAtTime: () => void;
    exponentialRampToValueAtTime: () => void;
  };
  readonly kind: "oscillator" | "gain";
  start: (at: number) => void;
  stop: (at: number) => void;
  type: string;
}

/** A fake audio context that records every oscillator it starts. */
function fakeContext(state = "running") {
  const oscillators: FakeNode[] = [];
  const context = {
    currentTime: 0,
    destination: {},
    state,
    resume: vi.fn(async () => undefined),
    createOscillator: () => {
      const node: FakeNode = {
        kind: "oscillator",
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
        type: "sine",
        frequency: { value: 0 },
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
      };
      oscillators.push(node);
      return node;
    },
    createGain: () => ({
      connect: () => undefined,
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
    }),
  };
  return { context, oscillators };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sound player", () => {
  it("is silent and does not throw where the browser has no audio", () => {
    const player = createSoundPlayer(() => null);
    expect(() => {
      player.play("admitted");
      player.unlock();
      player.play("refused");
    }).not.toThrow();
  });

  it("creates its audio only on the first unlock, from a tap", () => {
    const { context } = fakeContext();
    const make = vi.fn(() => context as unknown as ToneContext);
    const player = createSoundPlayer(make);
    expect(make).not.toHaveBeenCalled();
    player.unlock();
    player.unlock();
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("resumes a context the browser suspended", () => {
    const { context } = fakeContext("suspended");
    const player = createSoundPlayer(() => context as unknown as ToneContext);
    player.unlock();
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it("plays the steps of each signal, admitted and refused sounding different", () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer(() => context as unknown as ToneContext);
    player.unlock();
    player.play("admitted");
    expect(oscillators).toHaveLength(TONES.admitted.length);
    player.play("refused");
    expect(oscillators).toHaveLength(
      TONES.admitted.length + TONES.refused.length
    );
    const admitted = TONES.admitted.map((step) => step.frequency).join(",");
    const refused = TONES.refused.map((step) => step.frequency).join(",");
    expect(admitted).not.toBe(refused);
  });
});

describe("vibrate", () => {
  it("uses the pattern for each signal where vibration exists", () => {
    const vibrateSpy = vi.fn(() => true);
    vibrate("admitted", { vibrate: vibrateSpy });
    vibrate("refused", { vibrate: vibrateSpy });
    expect(vibrateSpy).toHaveBeenNthCalledWith(1, [60]);
    expect(vibrateSpy).toHaveBeenNthCalledWith(2, [250, 120, 250]);
  });

  it("does nothing on a phone that cannot vibrate, such as an iPhone", () => {
    expect(() => vibrate("refused", {})).not.toThrow();
    expect(() => vibrate("refused", undefined)).not.toThrow();
  });
});

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
