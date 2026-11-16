// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "@/lib/offline-store";
import { useOffline } from "@/lib/use-offline";
import { API_ORIGIN, OFFLINE_LIST, SECRET } from "@/test/fixtures";

vi.mock("@/lib/scan-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-api")>();
  return {
    ...actual,
    readOfflineList: vi.fn(),
    sendOfflineAdmissions: vi.fn(),
  };
});

import { readOfflineList, sendOfflineAdmissions } from "@/lib/scan-api";

const listMock = vi.mocked(readOfflineList);
const sendMock = vi.mocked(sendOfflineAdmissions);
const connection = { origin: API_ORIGIN, secret: SECRET };
const DB = "printix-offline-hook-test";
const makeStore = () => createOfflineStore(DB);

beforeEach(async () => {
  await Dexie.delete(DB);
  listMock.mockReset();
  listMock.mockResolvedValue({ kind: "list", list: OFFLINE_LIST });
  sendMock.mockReset();
  sendMock.mockResolvedValue({ kind: "no-signal" });
});

afterEach(() => {
  cleanup();
});

function renderOffline(onPairingProblem = vi.fn()) {
  return renderHook(() =>
    useOffline(connection, onPairingProblem, { makeStore })
  );
}

describe("useOffline", () => {
  it("downloads and keeps the ticket list", async () => {
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("ready"));
    expect(result.current.fetchedAt).not.toBeNull();
    expect(result.current.eventName).toBe("Harbour Night Market");
    expect(result.current.pending).toBe(0);
  });

  it("admits a valid barcode once with no signal and queues it", async () => {
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("ready"));

    let first: Awaited<ReturnType<typeof result.current.checkOffline>> = null;
    await act(async () => {
      first = await result.current.checkOffline("PX-0000000101", "camera");
    });
    expect(first).toMatchObject({ tone: "admitted" });
    await waitFor(() => expect(result.current.pending).toBe(1));

    let second: Awaited<ReturnType<typeof result.current.checkOffline>> = null;
    await act(async () => {
      second = await result.current.checkOffline("PX-0000000101", "camera");
    });
    expect(second).toMatchObject({ title: "Already admitted" });
    expect(result.current.pending).toBe(1);
  });

  it("refuses a void ticket and one admitted elsewhere", async () => {
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("ready"));
    await act(async () => {
      expect(
        await result.current.checkOffline("PX-0000000102", "camera")
      ).toMatchObject({ title: "Void ticket" });
      expect(
        await result.current.checkOffline("PX-0000000103", "camera")
      ).toMatchObject({ title: "Already admitted" });
    });
    expect(result.current.pending).toBe(0);
  });

  it("sends the queue when the signal comes back and shows conflicts", async () => {
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("ready"));
    await act(async () => {
      await result.current.checkOffline("PX-0000000101", "camera");
    });
    await waitFor(() => expect(result.current.pending).toBe(1));

    sendMock.mockImplementation(async (_connection, admissions) => ({
      kind: "synced",
      result: {
        results: admissions.map((admission) => ({
          client_ref: admission.client_ref,
          outcome: "already_admitted" as const,
          printed_number: "101",
          admitted_at: "2026-12-26T20:00:00Z",
          admitted_gate: "North gate",
        })),
        deferred: 0,
      },
    }));
    act(() => {
      result.current.markOnline(false);
      result.current.markOnline(true);
    });
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(sendMock).toHaveBeenCalledWith(connection, [
      expect.objectContaining({ value: "PX-0000000101" }),
    ]);
    expect(result.current.conflicts).toEqual([
      expect.objectContaining({
        printedNumber: "101",
        admittedGate: "North gate",
      }),
    ]);
  });

  it("gives no offline answer when the event refuses offline mode", async () => {
    listMock.mockResolvedValue({ kind: "offline-unavailable" });
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("unavailable"));
    await act(async () => {
      expect(
        await result.current.checkOffline("PX-0000000101", "camera")
      ).toBeNull();
    });
  });

  it("reports a pairing problem from the list download", async () => {
    listMock.mockResolvedValue({
      kind: "pairing",
      problem: "revoked-or-expired",
    });
    const onPairingProblem = vi.fn();
    renderOffline(onPairingProblem);
    await waitFor(() =>
      expect(onPairingProblem).toHaveBeenCalledWith("revoked-or-expired")
    );
  });

  it("forgets the saved list and queue", async () => {
    const { result } = renderOffline();
    await waitFor(() => expect(result.current.mode).toBe("ready"));
    await act(async () => {
      await result.current.checkOffline("PX-0000000101", "camera");
      await result.current.forget();
    });
    expect(await makeStore().snapshot()).toEqual({
      meta: null,
      pending: 0,
      conflicts: [],
    });
  });
});
