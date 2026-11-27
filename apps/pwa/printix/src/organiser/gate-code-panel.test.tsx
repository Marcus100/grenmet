// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GateCodePanel } from "@/organiser/gate-code-panel";

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

function panel(onHide: () => void) {
  return (
    <GateCodePanel
      expiresLabel="10:00"
      gate="North gate"
      onDone={() => undefined}
      onHide={onHide}
      secret="secret-value"
    />
  );
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("GateCodePanel page visibility", () => {
  it("drops the code straight away when the page is already hidden on mount", () => {
    setVisibility("hidden");
    const onHide = vi.fn();
    render(panel(onHide));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("keeps the code while the page is visible", () => {
    setVisibility("visible");
    const onHide = vi.fn();
    render(panel(onHide));
    expect(onHide).not.toHaveBeenCalled();
  });

  it("drops the code when the page becomes hidden later", () => {
    setVisibility("visible");
    const onHide = vi.fn();
    render(panel(onHide));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
