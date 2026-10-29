import { describe, expect, it } from "vitest";
import { NOTE_TITLE, stampDutyNote } from "./duty-note";

const NOW = new Date("2026-09-29T14:00:00Z"); // 10:00 AST

type Doc = Record<string, unknown>;
/** Runs the stamp on one incoming update, against the saved document. */
const stamp = (incoming: Doc, saved?: Doc): Doc =>
  stampDutyNote({ ...incoming }, saved, NOW);
/** A published note unless the test says otherwise. */
const note = (incoming: Doc, saved?: Doc): Doc =>
  stamp({ kind: "note", status: "published", ...incoming }, saved);

describe("the duty forecaster's note as a live post", () => {
  it("signs, times and expires a new note at the next issue", () => {
    const data = note({ text: "  Showers ease by mid-afternoon. " });
    expect(data).toMatchObject({
      title: NOTE_TITLE,
      publishedAt: "2026-09-29T14:00:00.000Z",
      expiresAt: "2026-09-29T16:00:00.000Z",
    });
  });
  it("keeps an explicit future expiry", () => {
    const data = note({
      text: "Hazy today.",
      expiresAt: "2026-09-29T22:00:00.000Z",
    });
    expect(data.expiresAt).toBe("2026-09-29T22:00:00.000Z");
  });
  it("ignores an expiry in the past and defaults to the next issue", () => {
    const data = note({
      text: "Hazy today.",
      expiresAt: "2026-09-29T13:00:00.000Z",
    });
    expect(data.expiresAt).toBe("2026-09-29T16:00:00.000Z");
  });
  it("posts again, with a new time, when the words change", () => {
    const saved = {
      kind: "note",
      status: "published",
      text: "Showers ease by mid-afternoon.",
      publishedAt: "2026-09-29T09:00:00.000Z",
      expiresAt: "2026-09-29T12:00:00.000Z",
    };
    const data = note({ text: "Showers now easing." }, saved);
    expect(data.publishedAt).toBe("2026-09-29T14:00:00.000Z");
    expect(data.expiresAt).toBe("2026-09-29T16:00:00.000Z");
  });
  it("keeps the time and expiry when only the title changes", () => {
    const saved = {
      kind: "note",
      status: "published",
      text: "Showers ease.",
      publishedAt: "2026-09-29T09:00:00.000Z",
      expiresAt: "2026-09-29T12:00:00.000Z",
    };
    const data = stamp({ title: "Note" }, saved);
    expect(data).not.toHaveProperty("publishedAt");
    expect(data).not.toHaveProperty("expiresAt");
  });
  it("reads the saved words when an update leaves them out, and fills a missing expiry without reposting", () => {
    const saved = {
      kind: "note",
      status: "published",
      text: "Saved words.",
      publishedAt: "2026-09-29T09:00:00.000Z",
    };
    const data = stamp({ title: "Note" }, saved);
    expect(data).not.toHaveProperty("publishedAt");
    expect(data.expiresAt).toBe("2026-09-29T16:00:00.000Z");
  });
  it("needs words before it can be posted, and keeps them within the limit", () => {
    expect(() => note({ text: "   " })).toThrow("Write the note");
    expect(() => note({ text: "x".repeat(281) })).toThrow("at most 280");
  });
  it("leaves other kinds of live post alone", () => {
    const data = stamp({
      kind: "update",
      status: "published",
      text: "Update.",
    });
    expect(data).toEqual({
      kind: "update",
      status: "published",
      text: "Update.",
    });
  });
  it("does not post a draft note", () => {
    const data = stamp({ kind: "note", status: "draft", text: "Not yet." });
    expect(data).not.toHaveProperty("publishedAt");
    expect(data).not.toHaveProperty("expiresAt");
  });
});
