"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Camera, CameraOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseScannedTicket } from "@/lib/door-scan";
import { reportError } from "@/lib/report-error";

const DEBOUNCE_MS = 3000;
const SCAN_INTERVAL_MS = 250;

interface DetectedBarcode {
  readonly rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

type Support = "checking" | "ok" | "unsupported" | "insecure";
type Problem = "denied" | "in-use" | "no-camera" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
  denied:
    "Camera access is blocked. Allow the camera for this site in the browser settings, then try again, or type the code instead.",
  "in-use":
    "The camera is being used by another app or tab. Close it and try again, or type the code instead.",
  "no-camera": "No camera was found on this device. Type the code instead.",
  failed: "The camera could not be started. Type the code instead.",
};

function problemFor(error: unknown): Problem {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "denied";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "in-use";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "no-camera";
  }
  return "failed";
}

/**
 * "Scan with camera" for the door console. Progressive enhancement: it needs
 * `BarcodeDetector` and `getUserMedia` in a secure context (https or
 * localhost); otherwise it says so and the typed/keyboard-scanner field is the
 * way in. Every decoded value goes to `onScan`, the same path as a typed code.
 */
export function DoorCamera({
  onScan,
  disabled = false,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [support, setSupport] = useState<Support>("checking");
  const [active, setActive] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!(detectorCtor() && navigator.mediaDevices?.getUserMedia)) {
      setSupport("unsupported");
    } else if (window.isSecureContext) {
      setSupport("ok");
    } else {
      setSupport("insecure");
    }
  }, []);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop();
    }
    stream.current = null;
    if (video.current) {
      video.current.srcObject = null;
    }
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  async function start() {
    const Detector = detectorCtor();
    if (!Detector || active) {
      return;
    }
    setProblem(null);
    setUnreadable(false);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.current = media;
      setActive(true);
      const element = video.current;
      if (element) {
        element.srcObject = media;
        await element.play().catch(() => undefined);
      }
      const detector = new Detector({ formats: ["qr_code"] });
      let busy = false;
      timer.current = setInterval(async () => {
        if (busy || !video.current) {
          return;
        }
        busy = true;
        try {
          const found = await detector.detect(video.current);
          handleReads(found.map((item) => item.rawValue));
        } catch {
          // A frame that cannot be read is skipped; the next one is tried.
        } finally {
          busy = false;
        }
      }, SCAN_INTERVAL_MS);
    } catch (error) {
      stop();
      const kind = problemFor(error);
      setProblem(kind);
      if (kind === "failed") {
        reportError(error, "events-door");
      }
    }
  }

  function handleReads(values: string[]) {
    for (const raw of values) {
      const value = parseScannedTicket(raw);
      if (!value) {
        setUnreadable(true);
        continue;
      }
      const now = Date.now();
      const previous = last.current;
      if (
        previous &&
        previous.value === value &&
        now - previous.at < DEBOUNCE_MS
      ) {
        continue;
      }
      last.current = { value, at: now };
      setUnreadable(false);
      onScanRef.current(value);
      return;
    }
  }

  if (support === "unsupported" || support === "insecure") {
    return (
      <p
        className="flex items-start gap-2 text-body text-muted-foreground"
        data-testid="camera-unsupported"
      >
        <CameraOff className="mt-0.5 size-4 shrink-0" />
        {support === "insecure"
          ? "Camera scanning needs a secure (https) connection. Type the code instead."
          : "Camera scanning is not supported in this browser. Type the code instead."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        className="h-11 w-full sm:w-auto"
        disabled={support === "checking" || disabled}
        onClick={active ? stop : start}
        type="button"
        variant="outline"
      >
        <Camera data-icon="inline-start" />
        {active ? "Stop camera" : "Scan with camera"}
      </Button>
      <div className={active ? "space-y-2" : "hidden"}>
        <video
          aria-label="Camera view: point at the ticket QR code"
          className="aspect-square w-full max-w-sm rounded-xl border bg-muted object-cover"
          muted
          playsInline
          ref={video}
        />
        <p className="text-caption text-muted-foreground">
          Point the camera at the ticket's QR code.
        </p>
      </div>
      {unreadable && active ? (
        <p className="text-caption text-muted-foreground" role="status">
          That QR code is not a ticket. Try another.
        </p>
      ) : null}
      {problem ? (
        <p className="text-body text-destructive" role="alert">
          {PROBLEM_TEXT[problem]}
        </p>
      ) : null}
    </div>
  );
}
