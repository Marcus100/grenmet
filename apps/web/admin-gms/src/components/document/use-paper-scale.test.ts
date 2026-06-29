import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it } from "vitest";
import { usePaperScale } from "./use-paper-scale";

const PAGE = { height: 1056, width: 816, maxScale: 0.6 };

describe("usePaperScale", () => {
  it("returns a layout clamped to [0.1, maxScale] once measured", () => {
    const ref = {
      current: document.createElement("div"),
    } as RefObject<HTMLElement | null>;
    const { result } = renderHook(() => usePaperScale(ref, PAGE));

    expect(result.current).not.toBeNull();
    expect(result.current?.scale).toBeGreaterThanOrEqual(0.1);
    expect(result.current?.scale).toBeLessThanOrEqual(PAGE.maxScale);
    expect(typeof result.current?.top).toBe("number");
  });

  it("stays null while the container ref is empty", () => {
    const ref = { current: null } as RefObject<HTMLElement | null>;
    const { result } = renderHook(() => usePaperScale(ref, PAGE));

    expect(result.current).toBeNull();
  });
});
