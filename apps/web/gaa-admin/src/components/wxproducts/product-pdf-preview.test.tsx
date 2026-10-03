import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductPdfPreview } from "./product-pdf-preview";

const SAVE_TO_DOWNLOAD_HINT = /Save draft to download these changes\./;

const download = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/wxproducts/product-actions", () => ({
  downloadProductPdfAction: download,
  previewProductPdfAction: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("@/components/document/document-preview", () => ({
  DocumentPreview: ({
    actions,
    children,
    description,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    description?: ReactNode;
  }) => (
    <div>
      {actions}
      {description}
      {children}
    </div>
  ),
}));
vi.mock("@/components/document/paper", () => ({
  Paper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  download.mockResolvedValue({ ok: false, error: "Download unavailable" });
});
const saved = {
  id: "fc5297f6-6870-4982-a41b-31f5c34cb9f2",
  revision: 3,
  publishedRevision: 2,
};
it("requires saving edits but allows the separate published copy", async () => {
  render(
    <ProductPdfPreview
      content={{ kind: "morning", values: {} }}
      dirty
      saved={saved}
    />
  );
  expect(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  ).toBeDisabled();
  expect(screen.getByText(SAVE_TO_DOWNLOAD_HINT)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Published r2: download PDF" })
  );
  await waitFor(() => expect(download).toHaveBeenCalledWith(saved.id, 2));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Download unavailable"
  );
});
it("downloads the current saved revision", async () => {
  render(
    <ProductPdfPreview
      content={{ kind: "morning", values: {} }}
      saved={saved}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  );
  await waitFor(() => expect(download).toHaveBeenCalledWith(saved.id, 3));
});
it("does not offer an unsaved document as a saved PDF", () => {
  render(<ProductPdfPreview content={{ kind: "morning", values: {} }} />);
  expect(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  ).toBeDisabled();
});
