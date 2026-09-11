// @vitest-environment jsdom
import {
  configureApiClient,
  type EmployeeDocumentPublic,
} from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { expiryLabel } from "@/components/hr/documents/document-fields";
import { DocumentWorkspace } from "@/components/hr/documents/document-workspace";
import { EmployeeDocuments } from "@/components/hr/documents/employee-documents";

const uploadDocument = vi.hoisted(() => vi.fn());
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  uploadDocumentApiV1HrDocumentsPost: uploadDocument,
}));

const DOWNLOAD = /Download Observer/;
const EDIT = /Edit/;
const ARCHIVE = /Archive/;
const ARCHIVED = /Archived/;

const BASE = "http://localhost";
const USER = "00000000-0000-0000-0000-000000000001";
const record = {
  organisation_id: "gaa",
  id: "00000000-0000-0000-0000-000000000002",
  user_id: USER,
  category: "CERTIFICATION",
  sensitivity: "STANDARD",
  title: "Observer certificate",
  original_filename: "certificate.pdf",
  content_type: "application/pdf",
  size_bytes: 1024,
  expiry_date: "2020-01-01",
  can_manage: true,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
} satisfies EmployeeDocumentPublic;
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/organisations`, () =>
    HttpResponse.json([
      { id: "gaa", code: "GAA", name: "Grenada Airports Authority" },
    ])
  ),
  http.get(`${BASE}/api/v1/hr/documents`, () =>
    HttpResponse.json({
      data: [record],
      count: 1,
      page: 1,
      size: 20,
      can_upload: true,
    })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  uploadDocument.mockReset();
});
afterAll(() => server.close());

function show(workspace = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {workspace ? <DocumentWorkspace /> : <EmployeeDocuments userId={USER} />}
    </QueryClientProvider>
  );
}

describe("employee documents", () => {
  it("shows expiry and uses the authenticated download route", async () => {
    show();
    expect(
      await screen.findByRole("heading", { name: "Observer certificate" })
    ).toBeVisible();
    expect(screen.getByText("Expired 2020-01-01")).toBeVisible();
    expect(screen.getByRole("link", { name: DOWNLOAD })).toHaveAttribute(
      "href",
      `/api/v1/hr/documents/${record.id}/download`
    );
  });

  it("keeps HR-filed documents read-only when the API denies management", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/documents`, () =>
        HttpResponse.json({
          data: [{ ...record, can_manage: false }],
          count: 1,
          can_upload: false,
        })
      )
    );
    show();
    await screen.findByRole("heading", { name: "Observer certificate" });
    expect(
      screen.queryByRole("button", { name: EDIT })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ARCHIVE })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upload document" })
    ).not.toBeInTheDocument();
  });

  it("limits upload categories and rejects invalid dates before submitting", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Upload document" })
    );
    expect(
      screen.queryByRole("option", { name: "Medical" })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Licence" },
    });
    fireEvent.change(screen.getByLabelText("Issue date"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(screen.getByLabelText("Expiry date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Upload document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Expiry must be on or after"
    );
  });

  it("saves metadata and refreshes the list", async () => {
    let title = record.title;
    server.use(
      http.get(`${BASE}/api/v1/hr/documents`, () =>
        HttpResponse.json({
          data: [{ ...record, title }],
          count: 1,
          can_upload: true,
        })
      ),
      http.patch(
        `${BASE}/api/v1/hr/documents/${record.id}`,
        async ({ request }) => {
          expect(await request.json()).toMatchObject({
            title: "Renewed certificate",
            expiry_date: "2020-01-01",
          });
          title = "Renewed certificate";
          return HttpResponse.json({ ...record, title });
        }
      )
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Observer certificate" })
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Renewed certificate" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Edit document" }));
    expect(
      await screen.findByRole("heading", { name: "Renewed certificate" })
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole("form")).not.toBeInTheDocument()
    );
  });

  it("requires confirmation before archiving and keeps archived files discoverable", async () => {
    let archived = false;
    server.use(
      http.get(`${BASE}/api/v1/hr/documents`, ({ request }) => {
        const include =
          new URL(request.url).searchParams.get("include_archived") === "true";
        const data =
          !archived || include
            ? [
                {
                  ...record,
                  archived_at: archived ? "2026-09-10T00:00:00Z" : null,
                },
              ]
            : [];
        return HttpResponse.json({
          data,
          count: data.length,
          can_upload: true,
        });
      }),
      http.post(`${BASE}/api/v1/hr/documents/${record.id}/archive`, () => {
        archived = true;
        return HttpResponse.json(record);
      })
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Archive Observer certificate",
      })
    );
    expect(archived).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await screen.findByText("No documents match these filters.");
    fireEvent.click(screen.getByLabelText("Include archived"));
    expect(await screen.findByText(ARCHIVED)).toBeVisible();
  });

  it("shows retry after a read failure", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/documents`, () =>
        HttpResponse.json({}, { status: 503 })
      )
    );
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load documents"
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("uses the scoped employee picker before loading a personnel record", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/document-employees`, () =>
        HttpResponse.json({
          data: [
            {
              user_id: USER,
              name: "Test Employee",
              department_id: "met",
              can_upload: true,
            },
          ],
          count: 1,
        })
      )
    );
    show(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Test Employee · met" })
    );
    expect(
      await screen.findByRole("heading", { name: "Observer certificate" })
    ).toBeVisible();
  });

  it("submits the selected file and metadata, then closes the editor", async () => {
    uploadDocument.mockReturnValue({ unwrap: async () => record });
    const file = new File(["%PDF-1.4 test"], "certificate.pdf", {
      type: "application/pdf",
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Upload document" })
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New certificate" },
    });
    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [file] },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Upload document" }));
    await waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledWith({
        body: {
          title: "New certificate",
          category: "CERTIFICATION",
          file,
          user_id: USER,
          description: null,
          issued_date: null,
          expiry_date: null,
          issuing_authority: null,
          reference_number: null,
        },
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("form")).not.toBeInTheDocument()
    );
  });

  it("treats an expiry date as valid through that day", () => {
    expect(expiryLabel("2026-09-10", "2026-09-10")).toBe("Expires today");
    expect(expiryLabel(null, "2026-09-10")).toBe("No expiry date");
  });
});

it("requires organisation selection and clears the selected employee on change", async () => {
  const requests: string[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/organisations`, () =>
      HttpResponse.json([
        { id: "gaa", code: "GAA", name: "Grenada Airports Authority" },
        { id: "other", code: "OTHER", name: "Other organisation" },
      ])
    ),
    http.get(`${BASE}/api/v1/hr/document-employees`, ({ request }) => {
      const organisation =
        new URL(request.url).searchParams.get("organisation_id") ?? "missing";
      requests.push(organisation);
      return HttpResponse.json({
        data: [
          {
            user_id: USER,
            name: `${organisation} employee`,
            department_id: "hr",
            can_upload: true,
          },
        ],
        count: 1,
        page: 1,
        size: 20,
      });
    })
  );
  show(true);
  const selector = await screen.findByLabelText("Organisation");
  expect(requests).toEqual([]);
  fireEvent.change(selector, { target: { value: "gaa" } });
  fireEvent.click(
    await screen.findByRole("button", { name: "gaa employee · hr" })
  );
  await screen.findByRole("region", { name: "Employee documents" });
  fireEvent.change(selector, { target: { value: "other" } });
  await screen.findByRole("button", { name: "other employee · hr" });
  expect(
    screen.queryByRole("region", { name: "Employee documents" })
  ).not.toBeInTheDocument();
  expect(requests).toEqual(["gaa", "other"]);
});

it("filters the current page without hiding the pagination count", async () => {
  show();
  await screen.findByRole("heading", { name: "Observer certificate" });
  fireEvent.change(screen.getByLabelText("Expiry filter (current page)"), {
    target: { value: "current" },
  });
  expect(
    screen.queryByRole("heading", { name: "Observer certificate" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("No documents match these filters.")).toBeVisible();
  expect(screen.getByText("Page 1 of 1 · 1 documents")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Expiry filter (current page)"), {
    target: { value: "expired" },
  });
  expect(
    screen.getByRole("heading", { name: "Observer certificate" })
  ).toBeVisible();
});
