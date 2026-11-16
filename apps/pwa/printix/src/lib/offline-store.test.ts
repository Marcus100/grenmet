import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOfflineStore,
  type ListMeta,
  type QueuedAdmission,
  type StoredTicket,
} from "@/lib/offline-store";

let count = 0;
const names: string[] = [];

/** A store on its own database, so tests never share data. */
function freshStore() {
  count += 1;
  const name = `printix-offline-test-${count}`;
  names.push(name);
  return createOfflineStore(name);
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

const meta = (tag = "tag-a"): ListMeta => ({
  eventId: "event-1",
  eventName: "Harbour Night Market",
  eventStatus: "open",
  fetchedAt: "2026-12-26T19:00:00.000Z",
  generatedAt: "2026-12-26T19:00:00Z",
  hashKey: "key",
  pairingTag: tag,
});

const ticket = (hash: string, state: StoredTicket["state"] = "valid") => ({
  hash,
  printedNumber: hash.toUpperCase(),
  state,
  admittedAt: null,
  admittedGate: null,
  admittedHere: false,
});

const queued = (
  hash: string,
  scannedAt: string,
  tag = "tag-a"
): QueuedAdmission => ({
  clientRef: `ref-${hash}`,
  hash,
  pairingTag: tag,
  printedNumber: hash.toUpperCase(),
  scannedAt,
  value: `barcode-${hash}`,
});

describe("offline store", () => {
  it("starts empty, then saves a list and finds tickets by hash", async () => {
    const store = freshStore();
    expect(await store.load("tag-a")).toEqual({
      meta: null,
      pending: 0,
      conflicts: [],
    });
    const snapshot = await store.replaceList(meta(), [
      ticket("a"),
      ticket("b", "void"),
    ]);
    expect(snapshot.meta?.eventName).toBe("Harbour Night Market");
    expect((await store.find("b"))?.state).toBe("void");
    expect(await store.find("missing")).toBeUndefined();
  });

  it("marks an offline admission and queues it, oldest first", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a"), ticket("b")]);
    await store.admit(queued("b", "2026-12-26T20:02:00.000Z"));
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    expect(await store.find("a")).toMatchObject({
      state: "admitted",
      admittedHere: true,
      admittedAt: "2026-12-26T20:01:00.000Z",
    });
    expect((await store.pending(10)).map((entry) => entry.hash)).toEqual([
      "a",
      "b",
    ]);
    expect((await store.pending(1)).length).toBe(1);
  });

  it("keeps this phone's queued admissions when a fresh list arrives", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    // The server's list does not know about the offline admission yet.
    await store.replaceList(meta(), [ticket("a"), ticket("c")]);
    expect(await store.find("a")).toMatchObject({
      state: "admitted",
      admittedHere: true,
    });
    expect((await store.find("c"))?.state).toBe("valid");
  });

  it("removes answered admissions and keeps their conflicts", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a"), ticket("b")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    await store.admit(queued("b", "2026-12-26T20:02:00.000Z"));
    const snapshot = await store.settle([
      { clientRef: "ref-a" },
      {
        clientRef: "ref-b",
        conflict: {
          clientRef: "ref-b",
          outcome: "already_admitted",
          printedNumber: "B",
          admittedAt: "2026-12-26T19:50:00Z",
          admittedGate: "North gate",
          scannedAt: "2026-12-26T20:02:00.000Z",
        },
      },
    ]);
    expect(snapshot.pending).toBe(0);
    expect(
      snapshot.conflicts.map((conflict) => conflict.printedNumber)
    ).toEqual(["B"]);
  });

  it("forgets everything saved for another pairing", async () => {
    const store = freshStore();
    await store.load("tag-a");
    await store.replaceList(meta("tag-a"), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    const snapshot = await store.load("tag-b");
    expect(snapshot).toEqual({ meta: null, pending: 0, conflicts: [] });
    expect(await store.find("a")).toBeUndefined();
  });

  it("keeps everything for the same pairing across a reload", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    const name = names.at(-1) ?? "";
    const reopened = createOfflineStore(name);
    const snapshot = await reopened.load("tag-a");
    expect(snapshot.pending).toBe(1);
    expect(snapshot.meta?.pairingTag).toBe("tag-a");
  });

  it("clears everything on request", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    await store.clear();
    expect(await store.snapshot()).toEqual({
      meta: null,
      pending: 0,
      conflicts: [],
    });
  });
});
