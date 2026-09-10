import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Paper } from "./paper";

describe("Paper", () => {
  it("pins documents to the document font so print never inherits the UI font", () => {
    render(<Paper>content</Paper>);

    // font-document → --brand-font-document (Noto Sans). Set on Paper itself so
    // every document, and therefore every PDF, is Noto Sans regardless of the
    // user's font-switcher choice.
    expect(screen.getByText("content")).toHaveClass("font-document");
  });

  it("keeps the document font when a caller passes its own classes", () => {
    render(<Paper className="px-12 py-10 text-sm">content</Paper>);

    const paper = screen.getByText("content");
    expect(paper).toHaveClass("font-document");
    expect(paper).toHaveClass("px-12");
  });

  it("marks itself as the print target", () => {
    render(<Paper>content</Paper>);

    expect(screen.getByText("content")).toHaveAttribute("data-print-paper");
  });
});
