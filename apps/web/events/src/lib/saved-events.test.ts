import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseSaved, useSavedEvents } from "./saved-events";

afterEach(() => {
  window.localStorage.clear();
});

describe("parseSaved", () => {
  it("ignores malformed storage", () => {
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved('{"a":1}')).toEqual([]);
    expect(parseSaved('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});

describe("useSavedEvents", () => {
  it("toggles and persists a saved event", () => {
    const { result } = renderHook(() => useSavedEvents());
    expect(result.current.isSaved("feel-free-sunset")).toBe(false);

    act(() => result.current.toggle("feel-free-sunset"));
    expect(result.current.isSaved("feel-free-sunset")).toBe(true);
    expect(window.localStorage.getItem("barrels-events:saved")).toBe(
      '["feel-free-sunset"]'
    );

    act(() => result.current.toggle("feel-free-sunset"));
    expect(result.current.saved).toEqual([]);
  });
});
