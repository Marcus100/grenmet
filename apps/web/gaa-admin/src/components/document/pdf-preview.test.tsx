import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfPreview, type PdfSource } from "./pdf-preview";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const FIRST_FRAME = "blob:pdf-1#toolbar=0&navpanes=0&view=FitH";

let counter = 0;
beforeEach(() => {
  counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:pdf-${++counter}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const pdfBlob = () => new Blob(["%PDF-1.7"]);

function source(renderPdf: PdfSource["render"], filename = "a.pdf"): PdfSource {
  return { filename, render: renderPdf };
}

function Preview({ inputKey, pdf }: { inputKey: string; pdf: PdfSource }) {
  return <PdfPreview inputKey={inputKey} pdf={pdf} title="T" />;
}

async function press(name: string) {
  await act(() => {
    fireEvent.click(screen.getByRole("button", { name }));
    return Promise.resolve();
  });
}

it("keeps the last PDF when a refresh fails and retries on request", async () => {
  const renderPdf = vi
    .fn<PdfSource["render"]>()
    .mockResolvedValueOnce(pdfBlob())
    .mockRejectedValueOnce(new Error("Renderer down"))
    .mockResolvedValueOnce(pdfBlob());
  const view = render(<Preview inputKey="a" pdf={source(renderPdf)} />);
  await press("Preview");
  expect(screen.getByTitle("T frame")).toHaveAttribute("src", FIRST_FRAME);

  view.rerender(<Preview inputKey="b" pdf={source(renderPdf)} />);
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  await press("Preview");
  expect(screen.getByRole("alert")).toHaveTextContent("Renderer down");
  expect(screen.getByTitle("T frame")).toHaveAttribute("src", FIRST_FRAME);

  await press("Retry PDF preview");
  expect(renderPdf).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-1");
});

it("cancels a pending render when it unmounts", async () => {
  let signal: AbortSignal | undefined;
  const renderPdf = vi.fn<PdfSource["render"]>((given) => {
    signal = given;
    return new Promise<Blob>(() => undefined);
  });
  const view = render(<Preview inputKey="a" pdf={source(renderPdf)} />);
  await press("Preview");
  expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("downloads under the name it was rendered with", async () => {
  const renderPdf = vi.fn<PdfSource["render"]>().mockResolvedValue(pdfBlob());
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("first.pdf");
    });
  const view = render(
    <Preview inputKey="a" pdf={source(renderPdf, "first.pdf")} />
  );
  await press("Preview");
  view.rerender(<Preview inputKey="a" pdf={source(renderPdf, "second.pdf")} />);
  await press("Download PDF");
  expect(click).toHaveBeenCalledOnce();
});

it("releases the PDF when it unmounts", async () => {
  const renderPdf = vi.fn<PdfSource["render"]>().mockResolvedValue(pdfBlob());
  const view = render(<Preview inputKey="a" pdf={source(renderPdf)} />);
  await press("Preview");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-1");
});
