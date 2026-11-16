import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "@/lib/offline-store";
import { listToStore, refreshList, syncQueue } from "@/lib/offline-sync";
import { OFFLINE_LIST } from "@/test/fixtures";

let count = 0;
const names: string[] = [];

function freshStore() {
  count += 1;
  const name = `printix-sync-test-${count}`;
  names.push(name);
  return createOfflineStore(name);
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

const NOW = () => new Date("2026-12-26T19:05:00.000Z");
const ticket101 = OFFLINE_LIST.tickets[0]?.barcode_hash ?? "";
const ticket103 = OFFLINE_LIST.tickets[2]?.barcode_hash ?? "";

async function storeWithQueue() {
  const store = freshStore();
  await refreshList(
    store,
    async () => ({ kind: "list", list: OFFLINE_LIST }),
    "tag",
    NOW
  );
  await store.admit({
    clientRef: "00000000-0000-4000-8000-000000000001",
    hash: ticket101,
    pairingTag: "tag",
    printedNumber: "101",
    scannedAt: "2026-12-26T20:01:00.000Z",
    value: "PX-0000000101",
  });
  await store.admit({
    clientRef: "00000000-0000-4000-8000-000000000002",
    hash: ticket103,
    pairingTag: "tag",
    printedNumber: "103",
    scannedAt: "2026-12-26T20:02:00.000Z",
    value: "PX-0000000103",
  });
  return store;
}

describe("listToStore", () => {
  it("keeps the event, the key, the download time and every ticket", () => {
    const { meta, tickets } = listToStore(OFFLINE_LIST, "tag", "now");
    expect(meta).toMatchObject({
      eventName: "Harbour Night Market",
      eventStatus: "open",
      hashKey: OFFLINE_LIST.hash_key,
      fetchedAt: "now",
      pairingTag: "tag",
    });
    expect(tickets.map((ticket) => ticket.state)).toEqual([
      "valid",
      "void",
      "admitted",
    ]);
    expect(tickets[2]).toMatchObject({ admittedGate: "North gate" });
  });
});

describe("refreshList", () => {
  it("saves a downloaded list with the time it arrived", async () => {
    const store = freshStore();
    const result = await refreshList(
      store,
      async () => ({ kind: "list", list: OFFLINE_LIST }),
      "tag",
      NOW
    );
    expect(result.kind).toBe("ok");
    expect((await store.snapshot()).meta?.fetchedAt).toBe(
      "2026-12-26T19:05:00.000Z"
    );
  });

  it("passes on a refusal or a failure and saves nothing", async () => {
    const store = freshStore();
    expect(
      await refreshList(
        store,
        async () => ({ kind: "offline-unavailable" }),
        "tag"
      )
    ).toEqual({ kind: "offline-unavailable" });
    expect(
      await refreshList(store, async () => ({ kind: "no-signal" }), "tag")
    ).toEqual({ kind: "no-signal" });
    expect((await store.snapshot()).meta).toBeNull();
  });
});

describe("syncQueue", () => {
  it("does not call the server when nothing is queued", async () => {
    const send = vi.fn();
    const result = await syncQueue(freshStore(), send);
    expect(result).toMatchObject({ kind: "ok", retryAfterMs: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the queue oldest first and keeps conflicts in words", async () => {
    const store = await storeWithQueue();
    const send = vi.fn(async () => ({
      kind: "synced" as const,
      result: {
        results: [
          {
            client_ref: "00000000-0000-4000-8000-000000000001",
            outcome: "admitted" as const,
            printed_number: "101",
          },
          {
            client_ref: "00000000-0000-4000-8000-000000000002",
            outcome: "already_admitted" as const,
            printed_number: "103",
            admitted_at: "2026-12-26T19:14:00Z",
            admitted_gate: "North gate",
          },
        ],
        deferred: 0,
      },
    }));
    const result = await syncQueue(store, send);
    expect(send).toHaveBeenCalledWith([
      {
        client_ref: "00000000-0000-4000-8000-000000000001",
        value: "PX-0000000101",
        scanned_at: "2026-12-26T20:01:00.000Z",
      },
      {
        client_ref: "00000000-0000-4000-8000-000000000002",
        value: "PX-0000000103",
        scanned_at: "2026-12-26T20:02:00.000Z",
      },
    ]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.snapshot.pending).toBe(0);
    expect(result.snapshot.conflicts).toEqual([
      expect.objectContaining({
        printedNumber: "103",
        outcome: "already_admitted",
        admittedGate: "North gate",
      }),
    ]);
  });

  it("keeps deferred admissions and waits as the server asks", async () => {
    const store = await storeWithQueue();
    const result = await syncQueue(store, async () => ({
      kind: "synced",
      result: {
        results: [
          {
            client_ref: "00000000-0000-4000-8000-000000000001",
            outcome: "admitted",
          },
        ],
        deferred: 1,
        retry_after_seconds: 60,
      },
    }));
    expect(result).toMatchObject({ kind: "ok", retryAfterMs: 60_000 });
    expect((await store.pending(10)).map((entry) => entry.value)).toEqual([
      "PX-0000000103",
    ]);
  });

  it("keeps the whole queue when the server cannot be reached", async () => {
    const store = await storeWithQueue();
    const result = await syncQueue(store, async () => ({ kind: "no-signal" }));
    expect(result).toEqual({ kind: "no-signal" });
    expect((await store.snapshot()).pending).toBe(2);
  });
});
