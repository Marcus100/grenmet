import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startUpload = vi.fn();
const finishUpload = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/data/actions", () => ({
  finishUpload: (...args: unknown[]) => finishUpload(...args),
  startUpload: (...args: unknown[]) => startUpload(...args),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash",
  useRouter: () => ({ push: vi.fn() }),
}));

import { ImageUpload, imageProblem } from "./image-upload";

const LARGER_LABEL = /larger than 2 MB/u;
const LINKED_LABEL = /linked to an organisation/u;
const FILE_ID = "6f1d2c3e-0000-4000-8000-000000000001";

function pick(file: File) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) {
    throw new Error("no file input");
  }
  fireEvent.change(input, { target: { files: [file] } });
}

describe("imageProblem", () => {
  it("accepts the allowed types within the limit", () => {
    expect(
      imageProblem({ size: 1000, type: "image/webp" }, "listing-image")
    ).toBeNull();
  });

  it("rejects other types and oversized files per purpose", () => {
    expect(imageProblem({ size: 10, type: "image/gif" }, "listing-image")).toBe(
      "Choose a JPEG, PNG or WebP image."
    );
    expect(
      imageProblem(
        { size: 3 * 1024 * 1024, type: "image/png" },
        "organiser-logo"
      )
    ).toMatch(LARGER_LABEL);
    expect(
      imageProblem(
        { size: 3 * 1024 * 1024, type: "image/png" },
        "listing-image"
      )
    ).toBeNull();
  });
});

describe("ImageUpload", () => {
  beforeEach(() => {
    for (const mock of [startUpload, finishUpload, fetchMock]) {
      mock.mockReset();
    }
    vi.stubGlobal("fetch", fetchMock);
  });

  it("explains when there is no organisation to store under", () => {
    render(
      <ImageUpload
        label="Cover"
        onChange={vi.fn()}
        organisationId={null}
        purpose="listing-image"
        value={null}
      />
    );
    expect(screen.getByText(LINKED_LABEL)).toBeInTheDocument();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });

  it("presigns, sends the file to storage, confirms, and reports the id", async () => {
    const onChange = vi.fn();
    startUpload.mockResolvedValue({
      ok: true,
      data: {
        id: "up-1",
        url: "https://bucket.test/put",
        headers: { "Content-Type": "image/png" },
      },
    });
    fetchMock.mockResolvedValue({ ok: true });
    finishUpload.mockResolvedValue({ ok: true, data: FILE_ID });
    render(
      <ImageUpload
        label="Cover"
        onChange={onChange}
        organisationId="org_1"
        purpose="listing-image"
        value={null}
      />
    );
    const file = new File(["x"], "a.png", { type: "image/png" });
    pick(file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(FILE_ID));
    expect(startUpload).toHaveBeenCalledWith("org_1", {
      contentType: "image/png",
      purpose: "listing-image",
      sizeBytes: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://bucket.test/put", {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: file,
    });
    expect(finishUpload).toHaveBeenCalledWith("org_1", "up-1");
  });

  it("does not call the API for a disallowed file", () => {
    render(
      <ImageUpload
        label="Cover"
        onChange={vi.fn()}
        organisationId="org_1"
        purpose="listing-image"
        value={null}
      />
    );
    pick(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("shows the API message when uploads are not configured", async () => {
    startUpload.mockResolvedValue({
      ok: false,
      error: "Uploads are not configured",
    });
    render(
      <ImageUpload
        label="Cover"
        onChange={vi.fn()}
        organisationId="org_1"
        purpose="listing-image"
        value={null}
      />
    );
    pick(new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Uploads are not configured"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not confirm when storage rejects the file", async () => {
    startUpload.mockResolvedValue({
      ok: true,
      data: { id: "up-1", url: "https://bucket.test/put", headers: {} },
    });
    fetchMock.mockResolvedValue({ ok: false });
    render(
      <ImageUpload
        label="Cover"
        onChange={vi.fn()}
        organisationId="org_1"
        purpose="listing-image"
        value={null}
      />
    );
    pick(new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "did not go through"
    );
    expect(finishUpload).not.toHaveBeenCalled();
  });

  it("shows the stored image through the same-origin path and can remove it", () => {
    const onChange = vi.fn();
    render(
      <ImageUpload
        label="Cover"
        onChange={onChange}
        organisationId="org_1"
        purpose="listing-image"
        value={FILE_ID}
      />
    );
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      `/files/${FILE_ID}`
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
