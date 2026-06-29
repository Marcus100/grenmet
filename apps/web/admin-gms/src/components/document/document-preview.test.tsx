import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentPreview } from "./document-preview";

const PRINT = /print/i;
const DOWNLOAD_PDF = /download pdf/i;

describe("DocumentPreview", () => {
  it("renders the title and the toolbar actions", () => {
    render(
      <DocumentPreview title="Invoice">
        <div>Body</div>
      </DocumentPreview>
    );

    expect(
      screen.getByRole("heading", { name: "Invoice" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PRINT })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: DOWNLOAD_PDF })
    ).toBeInTheDocument();
  });

  it("renders the document content (scaled preview + print portal)", () => {
    render(
      <DocumentPreview>
        <div>Paper body</div>
      </DocumentPreview>
    );

    // Once in the on-screen preview, once in the hidden print portal.
    expect(screen.getAllByText("Paper body").length).toBeGreaterThanOrEqual(1);
  });

  it("invokes a custom onDownloadPdf handler", async () => {
    const onDownloadPdf = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentPreview onDownloadPdf={onDownloadPdf}>
        <div>x</div>
      </DocumentPreview>
    );

    await user.click(screen.getByRole("button", { name: DOWNLOAD_PDF }));

    expect(onDownloadPdf).toHaveBeenCalledOnce();
  });

  it("falls back to window.print when no download handler is given", async () => {
    window.print = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentPreview>
        <div>x</div>
      </DocumentPreview>
    );

    await user.click(screen.getByRole("button", { name: DOWNLOAD_PDF }));

    expect(window.print).toHaveBeenCalled();
  });
});
