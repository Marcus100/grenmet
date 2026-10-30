import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentPreview } from "./document-preview";

const DOWNLOAD_PDF = /download pdf/iu;

describe("DocumentPreview (client-rendered document)", () => {
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

  it("shows the document only after Preview and marks later edits out of date", async () => {
    const user = userEvent.setup();
    const view = render(
      <DocumentPreview inputKey="a">
        <div>draft one</div>
      </DocumentPreview>
    );
    // Only the hidden print copy exists until the user asks for a preview.
    expect(screen.getAllByText("draft one")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getAllByText("draft one").length).toBeGreaterThan(1);
    expect(screen.queryByText("Preview out of date")).toBeNull();

    view.rerender(
      <DocumentPreview inputKey="b">
        <div>draft two</div>
      </DocumentPreview>
    );
    expect(screen.getByText("Preview out of date")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText("Preview out of date")).toBeNull();
  });
});
