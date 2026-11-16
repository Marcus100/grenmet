import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOfflineStore,
  forgetOfflineData,
  type ListMeta,
  type QueuedAdmission,
  type StoredTicket,
  unsentCount,
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
  closesAt: "2026-12-27T04:00:00Z",
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
      lost: 0,
      snapshot: { meta: null, pending: 0, conflicts: [] },
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
    const loaded = await store.load("tag-b");
    expect(loaded).toEqual({
      lost: 1,
      snapshot: { meta: null, pending: 0, conflicts: [] },
    });
    expect(await store.find("a")).toBeUndefined();
  });

  it("keeps everything for the same pairing across a reload", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    const name = names.at(-1) ?? "";
    const reopened = createOfflineStore(name);
    const { snapshot } = await reopened.load("tag-a");
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

  it("refuses a second offline admission of the same ticket in the same step", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a"), ticket("v", "void")]);
    const [first, second] = await Promise.all([
      store.admit(queued("a", "2026-12-26T20:01:00.000Z")),
      store.admit({
        ...queued("a", "2026-12-26T20:01:01.000Z"),
        clientRef: "ref-a2",
      }),
    ]);
    expect([first, second].sort()).toEqual([false, true]);
    expect(await store.admit(queued("v", "2026-12-26T20:02:00.000Z"))).toBe(
      false
    );
    expect(
      await store.admit(queued("missing", "2026-12-26T20:02:00.000Z"))
    ).toBe(false);
    expect((await store.snapshot()).pending).toBe(1);
  });

  it("keeps a live admission when an older list arrives", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a"), ticket("b")]);
    await store.markAdmitted("a", "2026-12-26T19:30:00Z", "Main gate");
    // A list the server made before that admission still says "valid".
    await store.replaceList(
      { ...meta(), generatedAt: "2026-12-26T19:20:00Z" },
      [ticket("a"), ticket("b")]
    );
    expect(await store.find("a")).toMatchObject({
      state: "admitted",
      admittedGate: "Main gate",
      admittedHere: false,
    });
    // A list made after it is trusted as it is.
    await store.replaceList(
      { ...meta(), generatedAt: "2026-12-26T19:40:00Z" },
      [ticket("a"), ticket("b")]
    );
    expect((await store.find("a"))?.state).toBe("valid");
  });

  it("clears read conflicts only", async () => {
    const store = freshStore();
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    await store.settle([
      {
        clientRef: "ref-x",
        conflict: {
          clientRef: "ref-x",
          outcome: "void",
          printedNumber: "X",
          admittedAt: null,
          admittedGate: null,
          scannedAt: "2026-12-26T20:00:00.000Z",
        },
      },
    ]);
    const snapshot = await store.clearConflicts();
    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.pending).toBe(1);
  });

  it("counts and deletes saved data from a screen with no open store", async () => {
    const store = freshStore();
    const name = names.at(-1) ?? "";
    await store.replaceList(meta(), [ticket("a")]);
    await store.admit(queued("a", "2026-12-26T20:01:00.000Z"));
    expect(await unsentCount(name)).toBe(1);
    await forgetOfflineData(name);
    expect(await unsentCount(name)).toBe(0);
    expect(await store.find("a")).toBeUndefined();
  });
});
