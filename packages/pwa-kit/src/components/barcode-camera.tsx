"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BarcodeReader,
  browserDetector,
  createBarcodeReader,
} from "../lib/barcode-reader";
import {
  CAMERA_PROBLEM_TEXT,
  type CameraProblem,
  cameraProblemFor,
} from "../lib/camera-problem";
import { reportError } from "../lib/report-error";
import { cleanScan } from "../lib/scan-value";
import { loadZxingLibrary } from "../lib/zxing-library";

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

/** The words the camera shows. Each app passes its own; these are the defaults. */
export interface BarcodeCameraText {
  /** Shown over the camera before it starts. */
  readonly hint: string;
  /** Shown when the page is not on https, where browsers refuse the camera. */
  readonly insecure: string;
  /** Shown under the camera once it reads, after "Reading with … ." */
  readonly privacy: string;
  /** Names the whole camera area for screen readers. */
  readonly region: string;
  /** The button that starts the camera. */
  readonly start: string;
  /** Names the live camera picture for screen readers. */
  readonly video: string;
}

export const DEFAULT_CAMERA_TEXT: BarcodeCameraText = {
  hint: "Hold the barcode inside the frame. The camera is used only to read it.",
  insecure:
    "The camera only works on a secure (https) address. Open the app from its https link.",
  privacy: "Nothing is sent except the code it reads.",
  region: "Barcode scanner",
  start: "Start scanning",
  video: "Camera view for reading the barcode",
};

const CONTROL =
  "bg-pwa-background/80 text-pwa-text focus-visible:outline-pwa-text min-h-11 rounded-full border border-pwa-rule px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";

function hasTorch(track: MediaStreamTrack): boolean {
  const capabilities = track.getCapabilities?.() ?? {};
  return "torch" in capabilities;
}

interface BarcodeCameraProps {
  /** Barcode formats to read; defaults to the common ticket and pass formats. */
  readonly formats?: readonly string[];
  /** Each barcode read, cleaned. The parent decides what it means. */
  readonly onRead: (value: string) => void;
  /** Called on the tap that starts the camera; iPhone needs it to play sounds. */
  readonly onStart?: () => void;
  readonly text?: BarcodeCameraText;
}

/**
 * The camera view: a wide viewfinder, torch and camera switch, and the decode
 * loop. It reports reads and never decides what they mean. Android uses the
 * phone's own barcode reader; iPhone uses the bundled one, so the app must run
 * `pwa-kit-copy-zxing` before dev and build.
 */
export function BarcodeCamera({
  formats,
  onRead,
  onStart,
  text = DEFAULT_CAMERA_TEXT,
}: BarcodeCameraProps) {
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
          formats,
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
    [formats, startLoop, stopStream]
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
    onStart?.();
    startCamera(facing.current).catch(() => undefined);
  };

  return (
    <section aria-label={text.region} className="flex flex-col gap-3">
      {/* Wider than tall, also on a desktop: the height is capped, not the width. */}
      <div className="bg-pwa-surface relative aspect-[16/10] max-h-[50dvh] w-full overflow-hidden">
        <video
          aria-label={text.video}
          className={`h-full w-full object-cover ${status === "on" ? "" : "invisible"}`}
          muted
          playsInline
          ref={video}
        />
        {status === "on" ? (
          <>
            <div
              aria-hidden="true"
              className="border-pwa-accent pointer-events-none absolute inset-x-6 top-1/2 h-1/3 -translate-y-1/2 rounded-2xl border-2"
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
            <p className="text-pwa-muted max-w-xs text-base">
              {status === "starting" ? "Starting the camera…" : text.hint}
            </p>
            {status === "off" ? (
              <button
                className="bg-pwa-accent text-pwa-on-accent focus-visible:outline-pwa-text min-h-14 w-full max-w-xs rounded-2xl px-6 text-lg font-semibold transition-transform duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={begin}
                type="button"
              >
                {text.start}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {problem ? (
        <p
          className="bg-pwa-bad text-pwa-on-bad rounded-2xl px-4 py-3 text-base font-semibold"
          role="alert"
        >
          {problem === "insecure"
            ? text.insecure
            : CAMERA_PROBLEM_TEXT[problem]}
        </p>
      ) : null}

      {decoder ? (
        <p className="text-pwa-muted text-sm">
          Reading with{" "}
          {decoder === "browser"
            ? "this phone's built-in barcode reader"
            : "the app's own barcode reader"}
          . {text.privacy}
        </p>
      ) : null}
    </section>
  );
}
