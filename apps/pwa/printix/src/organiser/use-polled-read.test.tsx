// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "@/organiser/errors";
import { REFRESH_MS, usePolledRead } from "@/organiser/use-polled-read";

const ok = (value: number): Outcome<number> => ({ ok: true, value });

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePolledRead", () => {
  it("reads now, then again every 10 seconds", async () => {
    const load = vi.fn(async () => ok(1));
    const { result } = renderHook(() => usePolledRead(load));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.value).toBe(1);

    await advance(REFRESH_MS);
    expect(load).toHaveBeenCalledTimes(2);
    await advance(REFRESH_MS);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keeps the last good value and says why a read failed", async () => {
    const load = vi
      .fn<() => Promise<Outcome<number>>>()
      .mockResolvedValueOnce(ok(7))
      .mockResolvedValueOnce({ ok: false, problem: { kind: "no-signal" } });
    const { result } = renderHook(() => usePolledRead(load));
    await settle();
    await advance(REFRESH_MS);
    expect(result.current.value).toBe(7);
    expect(result.current.problem).toEqual({ kind: "no-signal" });
  });

  it("waits as long as the server asks after a rate limit", async () => {
    const load = vi
      .fn<() => Promise<Outcome<number>>>()
      .mockResolvedValueOnce({
        ok: false,
        problem: { kind: "rate-limited", retryAfterSeconds: 30 },
      })
      .mockResolvedValue(ok(2));
    renderHook(() => usePolledRead(load));
    await settle();
    await advance(29_000);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops reading when the session has ended", async () => {
    const load = vi.fn(
      async (): Promise<Outcome<number>> => ({
        ok: false,
        problem: { kind: "session-ended" },
      })
    );
    renderHook(() => usePolledRead(load));
    await settle();
    await advance(REFRESH_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never overlaps two reads", async () => {
    let finish: (value: Outcome<number>) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<Outcome<number>>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderHook(() => usePolledRead(load));
    await settle();
    act(() => result.current.reload());
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(ok(1));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.value).toBe(1);
  });
});
