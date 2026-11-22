import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  finishLogoUploadAction: vi.fn(),
  startLogoUploadAction: vi.fn(),
}));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);
vi.mock("@/lib/report-error", () => ({ reportError }));

import { BrandColour, BrandLogo, BrandSection } from "./brand-section";

const COLOUR_INPUT = /^Accent colour/u;
const PICKER = /Pick the accent colour/u;
const CLEAR = /Clear colour/u;
const UPLOAD = /^Upload logo$/u;
const REPLACE = /^Replace logo$/u;
const REMOVE = /Remove logo/u;
const CONTRAST_TEXT =
  /Contrast with white text is \d+\.\d:1\. Emails use this colour\./u;
const PALE_TEXT = /too pale for white text/u;
const NAVY_TEXT = /Emails will use the Barrels navy \(#0b132b\)/u;
const INVALID_TEXT = /Use a colour like/u;
const EMPTY_TEXT = /No colour set/u;
const SVG_TEXT = /Export the logo as a PNG/u;
const SIZE_TEXT = /larger than 2 MB/u;
const SVG_EXPORT = /An SVG logo must be exported to PNG first/u;
const LOGO = "6f1c2a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6";

function text(id: string) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`no element ${id}`);
  }
  return node.textContent;
}

function hiddenLogo(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[name="logoFileId"]');
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

describe("accent colour", () => {
  it("says no colour is set, so emails use navy, and clear is off", () => {
    render(<BrandColour initial="" />);
    expect(text("profile-brandColour-message")).toBe(
      "No colour set. Emails use the Barrels navy."
    );
    expect(screen.getByRole("button", { name: CLEAR })).toBeDisabled();
  });

  it("passes a colour that clears 4.5:1 and shows the ratio", () => {
    render(<BrandColour initial="#0b63ee" />);
    expect(text("profile-brandColour-message")).toMatch(CONTRAST_TEXT);
    expect(screen.getByLabelText(COLOUR_INPUT)).toHaveValue("#0b63ee");
    expect(screen.getByLabelText(PICKER)).toHaveValue("#0b63ee");
  });

  it("falls back to navy for a pale colour and says so plainly", () => {
    render(<BrandColour initial="" />);
    fireEvent.change(screen.getByLabelText(COLOUR_INPUT), {
      target: { value: "#ffff00" },
    });
    const message = text("profile-brandColour-message") ?? "";
    expect(message).toMatch(PALE_TEXT);
    expect(message).toMatch(NAVY_TEXT);
  });

  it("flags text that is not a colour and does not change the picker", () => {
    render(<BrandColour initial="#0b63ee" />);
    fireEvent.change(screen.getByLabelText(COLOUR_INPUT), {
      target: { value: "#0b63e" },
    });
    expect(screen.getByLabelText(COLOUR_INPUT)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(text("profile-brandColour-message")).toMatch(INVALID_TEXT);
    expect(screen.getByLabelText(PICKER)).toHaveValue("#0b132b");
  });

  it("keeps the native picker and the text in step", () => {
    render(<BrandColour initial="" />);
    fireEvent.change(screen.getByLabelText(PICKER), {
      target: { value: "#2563eb" },
    });
    expect(screen.getByLabelText(COLOUR_INPUT)).toHaveValue("#2563eb");
  });

  it("clears the colour with one button", () => {
    render(<BrandColour initial="#2563eb" />);
    fireEvent.click(screen.getByRole("button", { name: CLEAR }));
    expect(screen.getByLabelText(COLOUR_INPUT)).toHaveValue("");
    expect(text("profile-brandColour-message")).toMatch(EMPTY_TEXT);
  });
});

describe("logo", () => {
  it("shows no logo and the upload button when none is saved", () => {
    const { container } = render(
      <BrandLogo businessName="Sea Salt" initial={null} orgSlug="sea-salt" />
    );
    expect(screen.getByText("No logo yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: UPLOAD })).toBeEnabled();
    expect(hiddenLogo(container)).toHaveValue("");
  });

  it("shows a saved logo with the business name as its alt text", () => {
    const { container } = render(
      <BrandLogo businessName="Sea Salt" initial={LOGO} orgSlug="sea-salt" />
    );
    expect(screen.getByAltText("Sea Salt")).toHaveAttribute(
      "src",
      `/files/${LOGO}`
    );
    expect(screen.getByRole("button", { name: REPLACE })).toBeInTheDocument();
    expect(hiddenLogo(container)).toHaveValue(LOGO);
  });

  it("refuses an SVG before any call and says to export a PNG", async () => {
    render(<BrandLogo businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SVG_TEXT);
    expect(actions.startLogoUploadAction).not.toHaveBeenCalled();
  });

  it("refuses a file over 2 MB before any call", async () => {
    render(<BrandLogo businessName="Sea Salt" initial={null} orgSlug="s" />);
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 3 * 1024 * 1024 });
    pick(big);
    expect(await screen.findByRole("alert")).toHaveTextContent(SIZE_TEXT);
    expect(actions.startLogoUploadAction).not.toHaveBeenCalled();
  });

  it("shows the server's plain refusal when the upload cannot start", async () => {
    actions.startLogoUploadAction.mockResolvedValue({
      ok: false,
      message: "The image has too many pixels. Try again.",
    });
    render(<BrandLogo businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The image has too many pixels. Try again."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads, confirms and stages the logo for the profile's Save", async () => {
    actions.startLogoUploadAction.mockResolvedValue({
      ok: true,
      target: {
        id: LOGO,
        url: "https://storage.test/put",
        headers: { "Content-Type": "image/png" },
      },
    });
    actions.finishLogoUploadAction.mockResolvedValue({
      ok: true,
      fileId: LOGO,
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { container } = render(
      <BrandLogo businessName="Sea Salt" initial={null} orgSlug="sea-salt" />
    );
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(
      await screen.findByText("Logo uploaded. Save the profile to use it.")
    ).toBeInTheDocument();
    expect(actions.startLogoUploadAction).toHaveBeenCalledWith("sea-salt", {
      contentType: "image/png",
      sizeBytes: 1,
    });
    expect(fetch).toHaveBeenCalledWith("https://storage.test/put", {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: expect.any(File),
    });
    expect(actions.finishLogoUploadAction).toHaveBeenCalledWith(
      "sea-salt",
      LOGO
    );
    await waitFor(() => expect(hiddenLogo(container)).toHaveValue(LOGO));
  });

  it("reports a failed transfer and keeps the logo that was saved", async () => {
    actions.startLogoUploadAction.mockResolvedValue({
      ok: true,
      target: { id: LOGO, url: "https://storage.test/put", headers: {} },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    const { container } = render(
      <BrandLogo businessName="Sea Salt" initial={LOGO} orgSlug="sea-salt" />
    );
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The upload did not go through. Try again."
    );
    expect(hiddenLogo(container)).toHaveValue(LOGO);
    expect(actions.finishLogoUploadAction).not.toHaveBeenCalled();
  });

  it("reports and retries when the transfer itself throws", async () => {
    actions.startLogoUploadAction.mockResolvedValue({
      ok: true,
      target: { id: LOGO, url: "https://storage.test/put", headers: {} },
    });
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    render(<BrandLogo businessName="Sea Salt" initial={null} orgSlug="s" />);
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The upload did not go through. Try again."
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.any(TypeError),
      "studio-logo"
    );
    expect(screen.getByRole("button", { name: UPLOAD })).toBeEnabled();
  });

  it("removes the logo from the form, not from storage, until Save", () => {
    const { container } = render(
      <BrandLogo businessName="Sea Salt" initial={LOGO} orgSlug="sea-salt" />
    );
    fireEvent.click(screen.getByRole("button", { name: REMOVE }));
    expect(hiddenLogo(container)).toHaveValue("");
    expect(screen.getByText("No logo yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Logo removed. Save the profile to apply it.")
    ).toBeInTheDocument();
  });

  it("explains the SVG rule and the size limit under the button", () => {
    render(<BrandLogo businessName="Sea Salt" initial={null} orgSlug="s" />);
    expect(screen.getByText(SVG_EXPORT)).toBeInTheDocument();
  });
});

describe("brand section", () => {
  it("renders the colour and logo fields together", () => {
    render(
      <BrandSection
        brandColour="#0b63ee"
        businessName="Sea Salt"
        logoFileId={null}
        orgSlug="sea-salt"
      />
    );
    expect(screen.getByRole("group", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByLabelText(COLOUR_INPUT)).toHaveValue("#0b63ee");
    expect(screen.getByRole("button", { name: UPLOAD })).toBeInTheDocument();
  });
});
