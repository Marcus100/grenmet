// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSoundPlayer,
  TONES,
  type ToneContext,
  vibrate,
} from "./feedback";

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
      player.play("success");
      player.unlock();
      player.play("failure");
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

  it("plays the steps of each signal, success and failure sounding different", () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer(() => context as unknown as ToneContext);
    player.unlock();
    player.play("success");
    expect(oscillators).toHaveLength(TONES.success.length);
    player.play("failure");
    expect(oscillators).toHaveLength(
      TONES.success.length + TONES.failure.length
    );
    const success = TONES.success.map((step) => step.frequency).join(",");
    const failure = TONES.failure.map((step) => step.frequency).join(",");
    expect(success).not.toBe(failure);
  });
});

describe("vibrate", () => {
  it("uses the pattern for each signal where vibration exists", () => {
    const vibrateSpy = vi.fn(() => true);
    vibrate("success", { vibrate: vibrateSpy });
    vibrate("failure", { vibrate: vibrateSpy });
    expect(vibrateSpy).toHaveBeenNthCalledWith(1, [60]);
    expect(vibrateSpy).toHaveBeenNthCalledWith(2, [250, 120, 250]);
  });

  it("does nothing on a phone that cannot vibrate, such as an iPhone", () => {
    expect(() => vibrate("failure", {})).not.toThrow();
    expect(() => vibrate("failure", undefined)).not.toThrow();
  });
});
