import { describe, expect, it } from "vitest";
import {
  mapLiveness,
  mapReadiness,
  organisationsCard,
  releaseCard,
  workerCard,
} from "@/lib/status";

describe("mapLiveness", () => {
  it("is ok on 200 with true", () => {
    expect(
      mapLiveness({ kind: "response", status: 200, body: true }).tone
    ).toBe("ok");
  });

  it("is down when the API is unreachable", () => {
    expect(mapLiveness({ kind: "unreachable" }).tone).toBe("down");
  });

  it("is down on any other answer", () => {
    expect(
      mapLiveness({ kind: "response", status: 200, body: "nope" }).tone
    ).toBe("down");
    expect(
      mapLiveness({ kind: "response", status: 500, body: null }).tone
    ).toBe("down");
  });
});

describe("mapReadiness", () => {
  it("is ready on 200", () => {
    const card = mapReadiness({
      kind: "response",
      status: 200,
      body: { status: "ready" },
    });
    expect(card).toMatchObject({ tone: "ok", summary: "Ready" });
  });

  it("is down on 503", () => {
    expect(
      mapReadiness({ kind: "response", status: 503, body: null })
    ).toMatchObject({ tone: "down", summary: "Not ready" });
  });

  it("is unknown when the API cannot be reached", () => {
    expect(mapReadiness({ kind: "unreachable" }).tone).toBe("unknown");
  });

  it("flags unexpected status codes", () => {
    const card = mapReadiness({ kind: "response", status: 418, body: null });
    expect(card.tone).toBe("down");
    expect(card.summary).toContain("418");
  });
});

describe("placeholder cards", () => {
  it("never invents a worker heartbeat", () => {
    expect(workerCard().tone).toBe("unknown");
  });

  it("shows the release label when set and unknown when not", () => {
    expect(releaseCard(" 2026.10.18 ")).toMatchObject({
      tone: "ok",
      summary: "2026.10.18",
    });
    expect(releaseCard("")).toMatchObject({
      tone: "unknown",
      summary: "Not set",
    });
  });

  it("counts organisations or says unknown", () => {
    expect(organisationsCard(3)).toMatchObject({ tone: "ok", summary: "3" });
    expect(organisationsCard(null).tone).toBe("unknown");
  });
});
