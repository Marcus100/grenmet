"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BarcodeReader,
  browserDetector,
  createBarcodeReader,
} from "@/lib/barcode-reader";
import {
  CAMERA_PROBLEM_TEXT,
  type CameraProblem,
  cameraProblemFor,
} from "@/lib/camera-problem";
import { reportError } from "@/lib/report-error";
import { cleanScan } from "@/lib/scan-value";
import { loadZxingLibrary } from "@/lib/zxing-library";

const SCAN_INTERVAL_MS = 200;

type Facing = "environment" | "user";
type Status = "off" | "starting" | "on";
type Problem = CameraProblem | "insecure";
interface Loop {
  timer: ReturnType<typeof setInterval> | null;
}
interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

const PROBLEM_TEXT: Record<Problem, string> = {
  ...CAMERA_PROBLEM_TEXT,
  insecure:
    "The camera only works on a secure (https) address. Open the scanner from its https link.",
};

const CONTROL =
  "bg-px-ink/80 text-px-paper focus-visible:outline-px-paper min-h-11 rounded-full border border-px-rule px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";

function hasTorch(track: MediaStreamTrack): boolean {
  const capabilities = track.getCapabilities?.() ?? {};
  return "torch" in capabilities;
}

interface GateScannerProps {
  /** Each barcode read, cleaned. The parent decides whether it is submitted. */
  readonly onRead: (value: string) => void;
  /** Called on the tap that starts the camera; iPhone needs it to play sounds. */
  readonly onStart: () => void;
}

/**
 * The camera view: a wide viewfinder, torch and camera switch, and the decode
 * loop. It reports reads and never decides what they mean.
 */
export function GateScanner({ onRead, onStart }: GateScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const loop = useRef<Loop | null>(null);
  const facing = useRef<Facing>("environment");
  const onReadRef = useRef(onRead);
  const [status, setStatus] = useState<Status>("off");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [decoder, setDecoder] = useState<BarcodeReader["source"] | null>(null);

  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  const stopStream = useCallback(() => {
    if (loop.current) {
      if (loop.current.timer) {
        clearInterval(loop.current.timer);
      }
      loop.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop();
    }
    stream.current = null;
    if (video.current) {
      video.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const stopCamera = useCallback(() => {
    stopStream();
    setStatus("off");
  }, [stopStream]);

  const startLoop = useCallback((reader: BarcodeReader) => {
    // Identifies this run of the loop. Once stopped, it is no longer current,
    // so a frame decoded late cannot reach the parent.
    const token: Loop = { timer: null };
    let busy = false;
    token.timer = setInterval(async () => {
      const element = video.current;
      if (busy || !element || element.readyState < 2) {
        return;
      }
      busy = true;
      try {
        const [found] = await reader.detect(element);
        const value = found ? cleanScan(found.rawValue) : null;
        if (value && loop.current === token) {
          onReadRef.current(value);
        }
      } catch {
        // A frame that cannot be decoded is normal; the next frame is tried.
      } finally {
        busy = false;
      }
    }, SCAN_INTERVAL_MS);
    loop.current = token;
  }, []);

  const startCamera = useCallback(
    async (nextFacing: Facing) => {
      if (!(window.isSecureContext && navigator.mediaDevices?.getUserMedia)) {
        setProblem("insecure");
        return;
      }
      stopStream();
      facing.current = nextFacing;
      setProblem(null);
      setStatus("starting");
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        stream.current = media;
        const element = video.current;
        if (element) {
          element.srcObject = media;
          await element.play().catch(() => undefined);
        }
        const track = media.getVideoTracks()[0];
        setTorchSupported(track ? hasTorch(track) : false);
        const reader = await createBarcodeReader({
          browser: browserDetector(),
          loadLibrary: loadZxingLibrary,
        });
        setDecoder(reader.source);
        setStatus("on");
        startLoop(reader);
      } catch (error) {
        stopStream();
        const kind = cameraProblemFor(error);
        if (kind === "failed") {
          reportError(error, "camera");
        }
        setProblem(kind);
        setStatus("off");
      }
    },
    [startLoop, stopStream]
  );

  const flip = () => {
    const next: Facing =
      facing.current === "environment" ? "user" : "environment";
    facing.current = next;
    if (status === "on") {
      startCamera(next).catch(() => undefined);
    }
  };

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) {
      return;
    }
    const next = !torchOn;
    // The DOM typings do not list torch, though Android Chrome accepts it.
    const constraints: TorchConstraintSet = { torch: next };
    try {
      await track.applyConstraints({ advanced: [constraints] });
      setTorchOn(next);
    } catch {
      // The phone refused the torch; the button keeps its current state.
    }
  };

  // A phone that locks or switches apps takes the camera away; stop cleanly.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        stopCamera();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopStream();
    };
  }, [stopCamera, stopStream]);

  const begin = () => {
    onStart();
    startCamera(facing.current).catch(() => undefined);
  };

  return (
    <section aria-label="Ticket scanner" className="flex flex-col gap-3">
      {/* Wider than tall, also on a desktop: the height is capped, not the width. */}
      <div className="bg-px-surface relative aspect-[16/10] max-h-[50dvh] w-full overflow-hidden">
        <video
          aria-label="Camera view for reading the ticket barcode"
          className={`h-full w-full object-cover ${status === "on" ? "" : "invisible"}`}
          muted
          playsInline
          ref={video}
        />
        {status === "on" ? (
          <>
            <div
              aria-hidden="true"
              className="border-px-green pointer-events-none absolute inset-x-6 top-1/2 h-1/3 -translate-y-1/2 rounded-2xl border-2"
            />
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
              <button className={CONTROL} onClick={flip} type="button">
                Switch camera
              </button>
              <div className="flex gap-2">
                {torchSupported ? (
                  <button
                    aria-pressed={torchOn}
                    className={CONTROL}
                    onClick={toggleTorch}
                    type="button"
                  >
                    {torchOn ? "Torch on" : "Torch off"}
                  </button>
                ) : null}
                <button className={CONTROL} onClick={stopCamera} type="button">
                  Stop camera
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-px-muted max-w-xs text-base">
              {status === "starting"
                ? "Starting the camera…"
                : "Hold the ticket's barcode inside the green frame. The camera is used only to read it."}
            </p>
            {status === "off" ? (
              <button
                className="bg-px-green text-px-ink focus-visible:outline-px-paper min-h-14 w-full max-w-xs rounded-2xl px-6 text-lg font-semibold transition-transform duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={begin}
                type="button"
              >
                Start scanning
              </button>
            ) : null}
          </div>
        )}
      </div>

      {problem ? (
        <p
          className="bg-px-stop text-px-paper rounded-2xl px-4 py-3 text-base font-semibold"
          role="alert"
        >
          {PROBLEM_TEXT[problem]}
        </p>
      ) : null}

      {decoder ? (
        <p className="text-px-muted text-sm">
          Reading with{" "}
          {decoder === "browser"
            ? "this phone's built-in barcode reader"
            : "the scanner's own barcode reader"}
          . Nothing is sent except the ticket value.
        </p>
      ) : null}
    </section>
  );
}
