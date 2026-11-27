import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  addGalleryPhotoAction: vi.fn(),
  finishGalleryUploadAction: vi.fn(),
  removeGalleryPhotoAction: vi.fn(),
  reorderGalleryAction: vi.fn(),
  startGalleryUploadAction: vi.fn(),
}));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);
vi.mock("@/lib/report-error", () => ({ reportError }));

import { GALLERY_MAX_PHOTOS } from "@/lib/gallery-photo";
import { GallerySection } from "./gallery-section";

const ONE = { id: "11111111-1111-4111-8111-111111111111", fileId: "f1" };
const TWO = { id: "22222222-2222-4222-8222-222222222222", fileId: "f2" };
const ADD = /^Add a photograph$/u;
const MEMBER_NOTE = /Only an owner or admin can change these photographs/u;
const REMOVE_ONE = /Remove one to add another/u;

function draw(
  photos: { id: string; fileId: string }[],
  editable = true
): HTMLElement {
  const { container } = render(
    <GallerySection
      businessName="Sea Salt Spa"
      editable={editable}
      orgSlug="sea-salt-spa"
      photos={photos}
    />
  );
  return container;
}

function pick(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error("no file input");
  }
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("the gallery section", () => {
  it("says what to do when there are no photographs", () => {
    draw([]);
    expect(screen.getByText("No photographs yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: ADD })).toBeTruthy();
  });

  it("shows each photograph with its move and remove buttons", () => {
    draw([ONE, TWO]);
    const images = screen.getAllByRole("img");
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "/files/f1",
      "/files/f2",
    ]);
    // The first cannot move earlier and the last cannot move later.
    expect(
      screen.getByRole("button", { name: "Move photograph 1 earlier" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move photograph 2 later" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove photograph 1" })
    ).toBeTruthy();
  });

  it("gives a member the photographs and no buttons", () => {
    draw([ONE], false);
    expect(screen.getAllByRole("img").length).toBe(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(MEMBER_NOTE)).toBeTruthy();
  });

  it("refuses a file that is too large before it uploads anything", () => {
    draw([]);
    pick(
      new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", {
        type: "image/jpeg",
      })
    );
    expect(screen.getByRole("alert").textContent).toContain("larger than 5 MB");
    expect(actions.startGalleryUploadAction).not.toHaveBeenCalled();
  });

  it("uploads, confirms and saves one photograph", async () => {
    actions.startGalleryUploadAction.mockResolvedValue({
      ok: true,
      target: { id: "up-1", url: "https://store.example/put", headers: {} },
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    actions.finishGalleryUploadAction.mockResolvedValue({
      ok: true,
      fileId: "f9",
    });
    actions.addGalleryPhotoAction.mockResolvedValue({
      ok: true,
      photos: [
        ONE,
        { id: "33333333-3333-4333-8333-333333333333", fileId: "f9" },
      ],
    });
    draw([ONE]);

    pick(new File(["x"], "work.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(actions.addGalleryPhotoAction).toHaveBeenCalledWith(
        "sea-salt-spa",
        "f9"
      );
    });
    expect(screen.getAllByRole("img").length).toBe(2);
    expect(screen.getByRole("status").textContent).toContain(
      "Photograph added"
    );
  });

  it("saves the new order when a photograph is moved", async () => {
    actions.reorderGalleryAction.mockResolvedValue({
      ok: true,
      photos: [TWO, ONE],
    });
    draw([ONE, TWO]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move photograph 2 earlier" })
    );

    await waitFor(() => {
      expect(actions.reorderGalleryAction).toHaveBeenCalledWith(
        "sea-salt-spa",
        [TWO.id, ONE.id]
      );
    });
    expect(
      screen.getAllByRole("img").map((img) => img.getAttribute("src"))
    ).toEqual(["/files/f2", "/files/f1"]);
  });

  it("removes a photograph and keeps what the API answers", async () => {
    actions.removeGalleryPhotoAction.mockResolvedValue({
      ok: true,
      photos: [TWO],
    });
    draw([ONE, TWO]);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove photograph 1" })
    );

    await waitFor(() => {
      expect(actions.removeGalleryPhotoAction).toHaveBeenCalledWith(
        "sea-salt-spa",
        ONE.id
      );
    });
    expect(screen.getAllByRole("img").length).toBe(1);
  });

  it("shows a refusal from the API and keeps the photographs it had", async () => {
    actions.removeGalleryPhotoAction.mockResolvedValue({
      ok: false,
      message: "Only an owner or admin can change this.",
    });
    draw([ONE]);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove photograph 1" })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Only an owner or admin"
      );
    });
    expect(screen.getAllByRole("img").length).toBe(1);
  });

  it("stops at twelve photographs", () => {
    draw(
      Array.from({ length: GALLERY_MAX_PHOTOS }, (_, index) => ({
        id: `0000000${index}-0000-4000-8000-000000000000`,
        fileId: `f${index}`,
      }))
    );
    expect(screen.getByRole("button", { name: ADD })).toBeDisabled();
    expect(screen.getByText(REMOVE_ONE)).toBeTruthy();
  });
});
