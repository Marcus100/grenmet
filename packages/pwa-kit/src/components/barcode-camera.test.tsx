// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeCamera, DEFAULT_CAMERA_TEXT } from "./barcode-camera";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BarcodeCamera", () => {
  it("waits for a tap before it asks for the camera", () => {
    render(<BarcodeCamera onRead={vi.fn()} />);
    expect(
      screen.getByRole("region", { name: DEFAULT_CAMERA_TEXT.region })
    ).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_CAMERA_TEXT.hint)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: DEFAULT_CAMERA_TEXT.start })
    ).toBeInTheDocument();
  });

  it("uses the app's own words", () => {
    render(
      <BarcodeCamera
        onRead={vi.fn()}
        text={{
          ...DEFAULT_CAMERA_TEXT,
          region: "Pass scanner",
          start: "Scan a pass",
        }}
      />
    );
    expect(
      screen.getByRole("region", { name: "Pass scanner" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scan a pass" })
    ).toBeInTheDocument();
  });

  it("says why the camera cannot start on an address that is not https", () => {
    vi.stubGlobal("isSecureContext", false);
    const onStart = vi.fn();
    render(<BarcodeCamera onRead={vi.fn()} onStart={onStart} />);
    fireEvent.click(
      screen.getByRole("button", { name: DEFAULT_CAMERA_TEXT.start })
    );
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      DEFAULT_CAMERA_TEXT.insecure
    );
  });
});
