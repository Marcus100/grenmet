import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorCamera } from "./door-camera";

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const TOKEN = "BT1.ABCDEFGHJK.abcdEFGH12345678";
const SCAN_BUTTON = /Scan with camera/;
const stopTrack = vi.fn();
let detect: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;

function install({ detector = true, media = true, secure = true } = {}) {
  detect = vi.fn().mockResolvedValue([{ rawValue: TOKEN }]);
  getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
  });
  Object.defineProperty(window, "isSecureContext", {
    value: secure,
    configurable: true,
  });
  vi.stubGlobal(
    "BarcodeDetector",
    detector
      ? class {
          detect = detect;
        }
      : undefined
  );
  Object.defineProperty(navigator, "mediaDevices", {
    value: media ? { getUserMedia } : undefined,
    configurable: true,
  });
}

async function tick(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function startCamera() {
  await tick(0);
  fireEvent.click(screen.getByRole("button", { name: SCAN_BUTTON }));
  await tick(0);
}

describe("DoorCamera", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("says so when BarcodeDetector is missing", async () => {
    install({ detector: false });
    render(<DoorCamera onScan={vi.fn()} />);
    await tick(0);
    expect(screen.getByTestId("camera-unsupported")).toHaveTextContent(
      "not supported in this browser"
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says so when getUserMedia is missing or the page is not secure", async () => {
    install({ media: false });
    const { unmount } = render(<DoorCamera onScan={vi.fn()} />);
    await tick(0);
    expect(screen.getByTestId("camera-unsupported")).toBeInTheDocument();
    unmount();
    install({ secure: false });
    render(<DoorCamera onScan={vi.fn()} />);
    await tick(0);
    expect(screen.getByTestId("camera-unsupported")).toHaveTextContent(
      "secure (https)"
    );
  });

  it("asks for the rear camera and passes the decoded value on", async () => {
    install();
    const onScan = vi.fn();
    render(<DoorCamera onScan={onScan} />);
    await startCamera();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    await tick();
    expect(onScan).toHaveBeenCalledWith(TOKEN);
  });

  it("ignores the same code within 3 seconds, then accepts it again", async () => {
    install();
    const onScan = vi.fn();
    render(<DoorCamera onScan={onScan} />);
    await startCamera();
    await tick(1000);
    expect(onScan).toHaveBeenCalledTimes(1);
    await tick(2500);
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it("does not send a value that is not a ticket", async () => {
    install();
    detect.mockResolvedValue([{ rawValue: "https://example.com" }]);
    const onScan = vi.fn();
    render(<DoorCamera onScan={onScan} />);
    await startCamera();
    await tick();
    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("not a ticket");
  });

  it("explains a blocked camera without reporting it", async () => {
    install();
    getUserMedia.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    render(<DoorCamera onScan={vi.fn()} />);
    await startCamera();
    expect(screen.getByRole("alert")).toHaveTextContent("blocked");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("explains a camera that is in use", async () => {
    install();
    getUserMedia.mockRejectedValue(
      new DOMException("busy", "NotReadableError")
    );
    render(<DoorCamera onScan={vi.fn()} />);
    await startCamera();
    expect(screen.getByRole("alert")).toHaveTextContent("another app");
  });

  it("reports unexpected failures without the error details in the area", async () => {
    install();
    getUserMedia.mockRejectedValue(new Error("boom"));
    render(<DoorCamera onScan={vi.fn()} />);
    await startCamera();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), "events-door");
  });

  it("stops the camera on unmount and when the tab is hidden", async () => {
    install();
    const { unmount } = render(<DoorCamera onScan={vi.fn()} />);
    await startCamera();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(stopTrack).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    await startCamera();
    unmount();
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });
});
