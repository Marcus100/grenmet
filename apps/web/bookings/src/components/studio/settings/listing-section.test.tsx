import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  finishCoverUploadAction: vi.fn(),
  startCoverUploadAction: vi.fn(),
}));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);
vi.mock("@/lib/report-error", () => ({ reportError }));

import {
  BusinessTypeField,
  CoverPhoto,
  ListingSection,
} from "./listing-section";

const COVER = "7a1c2a3e-1b2c-4d5e-8f90-a1b2c3d4e5f7";
const TYPE_LABEL = /^Type of business$/u;
const CHOOSE_FILE = /^Choose a cover photo$/u;
const UPLOAD = /^Upload cover photo$/u;
const REPLACE = /^Replace cover photo$/u;
const REMOVE = /Remove cover photo/u;
const SIZE_TEXT = /larger than 5 MB/u;
const HELP_TEXT = /JPEG, PNG or WebP, up to 5 MB/u;

function hiddenCover(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[name="coverFileId"]');
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

describe("type of business", () => {
  it("is a labelled select with Not set and the eleven types", () => {
    render(<BusinessTypeField initial={null} />);
    const select = screen.getByLabelText(TYPE_LABEL);
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("name", "businessType");
    expect(select).toHaveValue("");
    const options = Array.from(select.querySelectorAll("option")).map(
      (option) => option.textContent
    );
    expect(options).toEqual([
      "Not set",
      "Beauty",
      "Hair",
      "Health",
      "Fitness",
      "Auto",
      "Home",
      "Lessons",
      "Professional",
      "Tours",
      "Events",
      "Other",
    ]);
    expect(
      screen.getByText(
        "Shown on the Barrels Bookings home page so people can find you by type."
      )
    ).toBeInTheDocument();
  });

  it("starts on the stored type", () => {
    render(<BusinessTypeField initial="home_services" />);
    expect(screen.getByLabelText(TYPE_LABEL)).toHaveValue("home_services");
  });
});

describe("cover photo", () => {
  it("says there is none and offers Upload", () => {
    const { container } = render(
      <CoverPhoto businessName="Sea Salt" initial={null} orgSlug="s" />
    );
    expect(screen.getByText("No cover photo yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: UPLOAD })).toBeEnabled();
    expect(screen.queryByRole("button", { name: REMOVE })).toBeNull();
    expect(hiddenCover(container)).toHaveValue("");
    expect(screen.getByText(HELP_TEXT)).toBeInTheDocument();
  });

  it("previews a stored cover and offers Replace and Remove", () => {
    const { container } = render(
      <CoverPhoto businessName="Sea Salt" initial={COVER} orgSlug="s" />
    );
    expect(screen.getByAltText("Cover photo of Sea Salt")).toHaveAttribute(
      "src",
      `/files/${COVER}`
    );
    expect(screen.getByRole("button", { name: REPLACE })).toBeInTheDocument();
    expect(hiddenCover(container)).toHaveValue(COVER);
  });

  it("names the hidden file input and keeps it out of the tab order", () => {
    render(<CoverPhoto businessName="Sea Salt" initial={null} orgSlug="s" />);
    const input = screen.getByLabelText(CHOOSE_FILE);
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("tabindex", "-1");
  });

  it("refuses a wrong type or a file over 5 MB before any call", async () => {
    render(<CoverPhoto businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["x"], "c.gif", { type: "image/gif" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG or WebP image."
    );
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    pick(big);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(SIZE_TEXT)
    );
    expect(actions.startCoverUploadAction).not.toHaveBeenCalled();
  });

  it("shows the server's plain refusal when the upload cannot start", async () => {
    actions.startCoverUploadAction.mockResolvedValue({
      ok: false,
      message: "The image has too many pixels. Choose a different image.",
    });
    render(<CoverPhoto businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["x"], "c.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The image has too many pixels."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads, confirms and stages the cover, telling the host while busy", async () => {
    actions.startCoverUploadAction.mockResolvedValue({
      ok: true,
      target: {
        id: COVER,
        url: "https://storage.test/put",
        headers: { "Content-Type": "image/jpeg" },
      },
    });
    actions.finishCoverUploadAction.mockResolvedValue({
      ok: true,
      fileId: COVER,
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const onUploadingChange = vi.fn();
    const { container } = render(
      <CoverPhoto
        businessName="Sea Salt"
        initial={null}
        onUploadingChange={onUploadingChange}
        orgSlug="sea-salt"
      />
    );
    pick(new File(["x"], "c.jpg", { type: "image/jpeg" }));
    expect(
      await screen.findByText(
        "Cover photo uploaded. Save the profile to use it."
      )
    ).toBeInTheDocument();
    expect(actions.finishCoverUploadAction).toHaveBeenCalledWith(
      "sea-salt",
      COVER
    );
    await waitFor(() => expect(hiddenCover(container)).toHaveValue(COVER));
    expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reports a failed transfer and keeps the saved cover", async () => {
    actions.startCoverUploadAction.mockResolvedValue({
      ok: true,
      target: { id: COVER, url: "https://storage.test/put", headers: {} },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    const { container } = render(
      <CoverPhoto businessName="Sea Salt" initial={COVER} orgSlug="s" />
    );
    pick(new File(["x"], "c.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The upload did not go through. Try again."
    );
    expect(hiddenCover(container)).toHaveValue(COVER);
    expect(actions.finishCoverUploadAction).not.toHaveBeenCalled();
  });

  it("reports and recovers when the transfer throws", async () => {
    actions.startCoverUploadAction.mockResolvedValue({
      ok: true,
      target: { id: COVER, url: "https://storage.test/put", headers: {} },
    });
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    render(<CoverPhoto businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["x"], "c.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(TypeError),
      "studio-cover"
    );
    expect(screen.getByRole("button", { name: UPLOAD })).toBeEnabled();
  });

  it("removes the cover from the form, not from storage, until Save", () => {
    const { container } = render(
      <CoverPhoto businessName="Sea Salt" initial={COVER} orgSlug="s" />
    );
    fireEvent.click(screen.getByRole("button", { name: REMOVE }));
    expect(hiddenCover(container)).toHaveValue("");
    expect(screen.getByText("No cover photo yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Cover photo removed. Save the profile to apply it.")
    ).toBeInTheDocument();
  });
});

describe("home page section", () => {
  it("groups the type and the cover photo", () => {
    render(
      <ListingSection
        businessName="Sea Salt"
        businessType="beauty"
        coverFileId={null}
        orgSlug="s"
      />
    );
    expect(
      screen.getByRole("group", { name: "Home page" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(TYPE_LABEL)).toHaveValue("beauty");
    expect(screen.getByRole("button", { name: UPLOAD })).toBeInTheDocument();
  });
});
