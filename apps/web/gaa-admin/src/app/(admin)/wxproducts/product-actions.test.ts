import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  downloadProductPdfAction,
  loadProductHistoryAction,
  loadProductsAction,
  previewProductAction,
  saveProductAction,
} from "./product-actions";

const fetcher = vi.fn();
const id = "7d517fe0-a25b-4f12-a2b4-eaaed8116010";
const input = {
  id,
  expectedRevision: 0,
  kind: "marine",
  values: {},
  action: "draft",
  changeSummary: "",
  reviewed: false,
};
beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it("obtains CSRF proof and sends a cookie-authenticated mutation without actor identity", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ userId: id, csrfToken: "proof" }))
    .mockResolvedValueOnce(
      Response.json({
        id,
        kind: "marine",
        values: {},
        revision: 1,
        publishedRevision: null,
        updatedAt: "2026-09-17T12:00:00Z",
      })
    );
  expect((await saveProductAction({ ...input, actorId: "forged" })).ok).toBe(
    true
  );
  expect(fetcher.mock.calls[0][0]).toBe("/_backend/browser-session");
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
    method: "POST",
    headers: { "X-CSRF-Token": "proof" },
  });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(input);
});
it("does not write when session validation fails", async () => {
  fetcher.mockResolvedValue(
    Response.json({ detail: "Sign in again" }, { status: 401 })
  );
  expect((await saveProductAction(input)).ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("surfaces revision conflicts without retrying writes", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ userId: id, csrfToken: "proof" }))
    .mockResolvedValueOnce(
      Response.json({ detail: "Reload the newer revision" }, { status: 409 })
    );
  expect(await saveProductAction(input)).toEqual({
    ok: false,
    error: "Reload the newer revision",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("loads products and history using backend contracts", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ products: [] }))
    .mockResolvedValueOnce(Response.json({ history: [] }));
  expect(await loadProductsAction("marine", "2026-09-17")).toEqual({
    ok: true,
    products: [],
  });
  expect(await loadProductHistoryAction(id)).toEqual({ ok: true, history: [] });
});
it("rejects invalid inputs without a request", async () => {
  expect((await loadProductsAction("unknown", "2026-09-17")).ok).toBe(false);
  expect((await loadProductHistoryAction("../other")).ok).toBe(false);
  expect((await saveProductAction({ ...input, expectedRevision: -1 })).ok).toBe(
    false
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("previews through FastAPI and preserves normalized values and errors", async () => {
  const preview = {
    values: { issuedAt: "2026-09-17T07:00" },
    errors: ["Complete the forecast"],
    checked_at: "2026-09-17T12:00:00Z",
  };
  fetcher
    .mockResolvedValueOnce(Response.json({ userId: id, csrfToken: "proof" }))
    .mockResolvedValueOnce(Response.json(preview));
  expect(
    await previewProductAction({
      kind: "morning",
      values: {},
      expectedRevision: 0,
      changeSummary: "",
    })
  ).toEqual({ ok: true, preview });
  expect(fetcher.mock.calls[1][0]).toBe("/_backend/weather/products/preview");
  expect(fetcher.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("proof");
});
it("does not provide a valid preview during an outage", async () => {
  fetcher.mockRejectedValue(new Error("offline"));
  expect(
    (
      await previewProductAction({
        kind: "morning",
        values: {},
        expectedRevision: 0,
        changeSummary: "",
      })
    ).ok
  ).toBe(false);
});

it("downloads a saved PDF through the authenticated backend proxy", async () => {
  fetcher.mockResolvedValue(
    new Response("%PDF-test", {
      headers: { "content-type": "application/pdf" },
    })
  );
  const result = await downloadProductPdfAction(id, 2);
  expect(result.ok).toBe(true);
  expect(fetcher).toHaveBeenCalledWith(
    `/_backend/weather/products/${id}/revisions/2/pdf`,
    expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    })
  );
});
it("does not download an error response as a PDF", async () => {
  fetcher.mockResolvedValue(
    Response.json({ detail: "Unauthorized" }, { status: 401 })
  );
  expect((await downloadProductPdfAction(id, 2)).ok).toBe(false);
});
