// @vitest-environment node
import assert from "node:assert/strict";
import {
  configureApiClient,
  uploadDocumentApiV1HrDocumentsPost,
} from "@barrelsgd/api-client";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll as after, beforeAll as before, test } from "vitest";

const BASE = "http://localhost";
const USER = "00000000-0000-0000-0000-000000000001";
let received = false;
const server = setupServer(
  http.post(`${BASE}/api/v1/hr/documents`, async ({ request }) => {
    const body = await request.formData();
    assert.equal(body.get("user_id"), USER);
    assert.equal(body.get("category"), "CERTIFICATION");
    assert.equal(body.get("title"), "Observer certificate");
    assert.equal(body.has("description"), false);
    const file = body.get("file");
    assert.ok(file instanceof File);
    assert.equal(file.name, "certificate.pdf");
    assert.equal(await file.text(), "%PDF-1.4 test");
    received = true;
    return HttpResponse.json({ id: USER }, { status: 201 });
  })
);
before(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
after(() => server.close());

test("generated document upload preserves filename and file bytes", async () => {
  await uploadDocumentApiV1HrDocumentsPost({
    body: {
      user_id: USER,
      category: "CERTIFICATION",
      title: "Observer certificate",
      description: null,
      file: new File(["%PDF-1.4 test"], "certificate.pdf", {
        type: "application/pdf",
      }),
    },
  }).unwrap();
  assert.equal(received, true);
});
