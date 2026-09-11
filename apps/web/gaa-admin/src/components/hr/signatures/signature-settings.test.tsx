import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { SignatureSettings } from "./signature-settings";

const BASE = "http://localhost";
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/signature/me`, () => HttpResponse.json(null)),
  http.get(`${BASE}/api/v1/hr/signed-documents/me`, () =>
    HttpResponse.json({
      count: 1,
      data: [
        {
          id: "signed-1",
          entity_type: "leave_request",
          signer_name: "Test Staff",
          signed_at: "2026-09-11T12:00:00Z",
        },
      ],
    })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function showSettings() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SignatureSettings />
    </QueryClientProvider>
  );
}
it("uploads a signature, deletes the reusable image, and retains signed PDF links", async () => {
  let saved: {
    version: string;
    image_data_url: string;
    updated_at: string;
  } | null = null;
  const uploads: unknown[] = [];
  let deletes = 0;
  server.use(
    http.get(`${BASE}/api/v1/hr/signature/me`, () => HttpResponse.json(saved)),
    http.put(`${BASE}/api/v1/hr/signature/me`, async ({ request }) => {
      uploads.push(await request.json());
      saved = {
        version: "version-1",
        image_data_url: "data:image/png;base64,c2ln",
        updated_at: "2026-09-11T12:00:00Z",
      };
      return HttpResponse.json(saved);
    }),
    http.delete(`${BASE}/api/v1/hr/signature/me`, () => {
      saved = null;
      deletes += 1;
      return new HttpResponse(null, { status: 204 });
    })
  );
  showSettings();
  expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  fireEvent.change(
    screen.getByLabelText("Upload signature (PNG, up to 250 KB)"),
    {
      target: {
        files: [new File(["sig"], "signature.png", { type: "image/png" })],
      },
    }
  );
  expect(await screen.findByAltText("Signature upload preview")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect(await screen.findByAltText("Current saved signature")).toBeVisible();
  expect(uploads).toEqual([{ image_data_url: "data:image/png;base64,c2ln" }]);
  fireEvent.click(
    screen.getByRole("button", { name: "Delete saved signature" })
  );
  await waitFor(() => expect(deletes).toBe(1));
  await waitFor(() =>
    expect(
      screen.queryByAltText("Current saved signature")
    ).not.toBeInTheDocument()
  );
  expect(
    screen.getByRole("link", { name: "Download signed PDF" })
  ).toHaveAttribute("href", "/api/v1/hr/signed-documents/signed-1/pdf");
});
it("rejects non-PNG uploads without enabling save", () => {
  showSettings();
  fireEvent.change(
    screen.getByLabelText("Upload signature (PNG, up to 250 KB)"),
    {
      target: {
        files: [
          new File(["<svg/>"], "signature.svg", { type: "image/svg+xml" }),
        ],
      },
    }
  );
  expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  expect(
    screen.queryByAltText("Signature upload preview")
  ).not.toBeInTheDocument();
});
