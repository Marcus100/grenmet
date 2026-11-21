import { describe, expect, it } from "vitest";
import type { ManagedEvent } from "@/domain/types";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";
import { buildWhatsAppDraft } from "./whatsapp-draft";

const now = new Date("2026-12-20T12:00:00Z");
const site = "https://events.barrels.gd";
const source = makeManagedEvent({
  startsAt: "2026-12-27T00:30:00Z",
  title: "Synthetic harbour show",
  venue: "Example Wharf",
  slug: "synthetic-harbour-show",
  description: "Private description marker",
  goingNames: ["Attendee marker"],
  capacity: 1234,
});

describe("buildWhatsAppDraft", () => {
  it("includes only verified event facts, with Grenada time across UTC midnight", () => {
    const result = buildWhatsAppDraft(source, site, now);
    expect(result?.facts.split("\n")).toEqual([
      "Synthetic harbour show",
      "Saturday, 26 December at 8:30 PM (Grenada time)",
      "Example Wharf",
      "https://events.barrels.gd/events/synthetic-harbour-show",
    ]);
    expect(result?.prompt).toContain("WhatsApp opening line v1");
    expect(result?.prompt).toContain("Return the opening line only");
    expect(result?.prompt).toContain(
      "Saturday, 26 December at 8:30 PM (Grenada time)"
    );
    for (const excluded of [
      "Private description marker",
      "Attendee marker",
      "1234",
      "15000",
    ]) {
      expect(result?.facts).not.toContain(excluded);
      expect(result?.prompt).not.toContain(excluded);
    }
  });

  const ineligible: Partial<ManagedEvent>[] = [
    { status: "draft" },
    { status: "cancelled" },
    { visibility: "unlisted" },
    { accessType: "private" },
    { accessType: null },
    { organiser: makeOrganiser({ verified: false }) },
    { startsAt: now.toISOString() },
    { startsAt: "2026-12-19T23:00:00Z" },
    { startsAt: "invalid" },
    { slug: "../private" },
    { title: "\n " },
  ];
  it.each(ineligible)(
    "refuses an ineligible or unusable listing %j",
    (overrides) => {
      expect(
        buildWhatsAppDraft({ ...source, ...overrides }, site, now)
      ).toBeNull();
    }
  );

  it("omits an unknown venue and normalises public text to one line", () => {
    const result = buildWhatsAppDraft(
      { ...source, title: "Synthetic\nharbour show", venue: "  " },
      site,
      now
    );
    expect(result?.facts.split("\n")).toHaveLength(3);
    expect(result?.facts).toContain("Synthetic harbour show");
    expect(result?.prompt).toContain('"venue": null');
  });

  it("rejects a non-web canonical URL", () => {
    expect(buildWhatsAppDraft(source, "ftp://example.test", now)).toBeNull();
  });

  it("uses the rescheduled saved date when the organiser reopens the preview", () => {
    const result = buildWhatsAppDraft(
      { ...source, startsAt: "2026-12-28T00:30:00Z" },
      site,
      now
    );
    expect(result?.facts).toContain(
      "Sunday, 27 December at 8:30 PM (Grenada time)"
    );
    expect(result?.prompt).not.toContain("2026-12-26");
  });

  it("adds the year when the event is not in the current Grenada year", () => {
    const result = buildWhatsAppDraft(
      { ...source, startsAt: "2027-01-09T23:00:00Z" },
      site,
      now
    );
    expect(result?.facts).toContain(
      "Saturday, 9 January 2027 at 7:00 PM (Grenada time)"
    );
  });
});
