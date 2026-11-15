import { describe, expect, it } from "vitest";
import { createScanGate, SAME_TICKET_WINDOW_MS } from "@/lib/scan-gate";

describe("createScanGate", () => {
  it("submits a value the first time it is seen", () => {
    expect(createScanGate().offer("100", 0)).toBe(true);
  });

  it("submits a ticket held in view once, however long it stays", () => {
    const gate = createScanGate();
    expect(gate.offer("100", 0)).toBe(true);
    // The camera keeps reading the same ticket every 200 ms for ten seconds.
    for (let at = 200; at <= 10_000; at += 200) {
      expect(gate.offer("100", at)).toBe(false);
    }
  });

  it("submits the same ticket again only after it has been out of view", () => {
    const gate = createScanGate();
    gate.offer("100", 0);
    expect(gate.offer("100", SAME_TICKET_WINDOW_MS - 1)).toBe(false);
    // Out of view for a full window, then back in front of the camera.
    expect(gate.offer("100", SAME_TICKET_WINDOW_MS * 3)).toBe(true);
  });

  it("does not let two tickets in view take turns to be submitted", () => {
    const gate = createScanGate();
    expect(gate.offer("100", 0)).toBe(true);
    expect(gate.offer("101", 100)).toBe(true);
    expect(gate.offer("100", 200)).toBe(false);
    expect(gate.offer("101", 300)).toBe(false);
  });

  it("uses the window it is given", () => {
    const gate = createScanGate(1000);
    gate.offer("7", 0);
    expect(gate.offer("7", 1500)).toBe(true);
  });
});
