import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDetail } from "@/domain/types";
import { makeManagedEvent } from "@/test/factories";
import { readTicketEvents } from "./ticket-events";

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readTicketEvents", () => {
  it("keeps the events that read, and reports a failed read without throwing", async () => {
    const good: EventDetail = makeManagedEvent({ slug: "good" });
    const failure = new Error("API down");
    const read = vi.fn((slug: string) => {
      if (slug === "bad") {
        return Promise.reject(failure);
      }
      return Promise.resolve(slug === "good" ? good : null);
    });

    const events = await readTicketEvents(["good", "bad", "gone"], read);

    expect([...events.keys()]).toEqual(["good"]);
    expect(events.get("good")).toBe(good);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(failure, "my-tickets-terms");
  });
});
