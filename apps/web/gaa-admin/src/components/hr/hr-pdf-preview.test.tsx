import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadHrPdf, HrPdfPreview } from "./hr-pdf-preview";

const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError: report }));

const request = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset();
  report.mockReset();
  vi.stubGlobal("fetch", request);
  URL.createObjectURL = vi.fn(() => "blob:hr-preview");
  URL.revokeObjectURL = vi.fn();
});

it("shows API validation details and reports caught failures through the app reporter", async () => {
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        detail: "The employee does not belong to this department",
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      }
    )
  );
  render(
    <HrPdfPreview
      payload={{}}
      previewPath="/api/v1/hr/absentee-reports/preview-pdf"
      ready
      title="Absentee Report"
    />
  );
  await act(() => vi.advanceTimersByTimeAsync(750));
  expect(
    screen.getByText("The employee does not belong to this department")
  ).toBeInTheDocument();
  expect(screen.queryByTitle("Absentee Report PDF preview")).toBeNull();
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ status: 403 }),
    "hr-pdf-preview"
  );
});

it("downloads the edited PDF without invoking browser print", async () => {
  request.mockResolvedValue(pdfResponse());
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("absentee-report.pdf");
      expect(this.href).toBe("blob:hr-preview");
    });
  try {
    await downloadHrPdf({
      payload: { employee_id: "subject-2" },
      previewPath: "/api/v1/hr/absentee-reports/preview-pdf",
      filename: "absentee-report.pdf",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      employee_id: "subject-2",
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:hr-preview");
  } finally {
    click.mockRestore();
  }
});

it("uses the saved signed document for downloads after submission", async () => {
  request.mockResolvedValue(pdfResponse());
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  try {
    await downloadHrPdf({
      payload: { date: "changed" },
      previewPath: "/api/v1/hr/absentee-reports/preview-pdf",
      filename: "absentee-report.pdf",
      signedDocumentId: "signed-2",
    });
    expect(request.mock.calls[0][0]).toBe(
      "/api/v1/hr/signed-documents/signed-2/pdf"
    );
    expect(request.mock.calls[0][1].method).toBe("GET");
    expect(request.mock.calls[0][1].body).toBeUndefined();
  } finally {
    click.mockRestore();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function pdfResponse() {
  return new Response(new Blob(["%PDF-1.7"]), {
    headers: { "content-type": "application/pdf" },
  });
}

it("renders an edited form through the FastAPI PDF endpoint after edits settle", async () => {
  request.mockResolvedValue(pdfResponse());
  const view = render(
    <HrPdfPreview
      payload={{ leave_type: "VACATION", days_requested: "1" }}
      previewPath="/api/v1/hr/leave-requests/preview-pdf"
      ready
      title="Leave Application"
    />
  );
  view.rerender(
    <HrPdfPreview
      payload={{ leave_type: "VACATION", days_requested: "2" }}
      previewPath="/api/v1/hr/leave-requests/preview-pdf"
      ready
      title="Leave Application"
    />
  );
  await act(() => vi.advanceTimersByTimeAsync(749));
  expect(request).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe(
    "/api/v1/hr/leave-requests/preview-pdf"
  );
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
    days_requested: "2",
  });
  expect(screen.getByTitle("Leave Application PDF preview")).toHaveAttribute(
    "src",
    "blob:hr-preview#toolbar=0&navpanes=0&view=FitH"
  );
});

it("loads the immutable signed PDF after submission", async () => {
  request.mockResolvedValue(pdfResponse());
  render(
    <HrPdfPreview
      payload={{}}
      previewPath="/api/v1/hr/leave-requests/preview-pdf"
      ready={false}
      signedDocumentId="signed-1"
      title="Leave Application"
    />
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(request.mock.calls[0][0]).toBe(
    "/api/v1/hr/signed-documents/signed-1/pdf"
  );
  expect(request.mock.calls[0][1].method).toBe("GET");
});

it("clears an obsolete PDF when required form fields are removed", async () => {
  request.mockResolvedValue(pdfResponse());
  const view = render(
    <HrPdfPreview
      payload={{ start_date: "2026-10-01" }}
      previewPath="/api/v1/hr/leave-requests/preview-pdf"
      ready
      title="Leave Application"
    />
  );
  await act(() => vi.advanceTimersByTimeAsync(750));
  expect(
    screen.getByTitle("Leave Application PDF preview")
  ).toBeInTheDocument();
  view.rerender(
    <HrPdfPreview
      payload={{ start_date: "" }}
      previewPath="/api/v1/hr/leave-requests/preview-pdf"
      ready={false}
      title="Leave Application"
    />
  );
  expect(screen.queryByTitle("Leave Application PDF preview")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:hr-preview");
});
