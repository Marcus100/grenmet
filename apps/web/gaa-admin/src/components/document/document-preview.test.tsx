import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentPreview } from "./document-preview";

const DOWNLOAD_PDF = /download pdf/i;

describe("DocumentPreview", () => {
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
