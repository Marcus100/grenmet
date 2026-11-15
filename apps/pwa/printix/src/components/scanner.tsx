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
import {
  cleanScan,
  formatLabel,
  isRepeat,
  type LastScan,
} from "@/lib/scan-value";
import { loadZxingLibrary } from "@/lib/zxing-library";

const SCAN_INTERVAL_MS = 200;
const HISTORY_LENGTH = 5;

interface Reading {
  readonly at: string;
  readonly format: string;
  readonly value: string;
}

type Phase = "idle" | "starting" | "scanning";

function clock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * Week-one scanner: starts the camera, reads a barcode and shows exactly what
 * it holds. Nothing is sent anywhere. The reading tells us what the printed
 * Printix tickets carry before the ticket registry is designed.
 */
export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef<LastScan | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<CameraProblem | "insecure" | null>(
    null
  );
  const [decoder, setDecoder] = useState<BarcodeReader["source"] | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);

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
    setPhase("idle");
  }, []);

  useEffect(() => stop, [stop]);

  // A phone that locks or switches apps takes the camera away; stop cleanly.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  function watch(reader: BarcodeReader) {
    let busy = false;
    timer.current = setInterval(async () => {
      const element = video.current;
      if (busy || !element || element.readyState < 2) {
        return;
      }
      busy = true;
      try {
        const [found] = await reader.detect(element);
        const value = found ? cleanScan(found.rawValue) : null;
        const now = Date.now();
        if (found && value && !isRepeat(last.current, value, now)) {
          setReadings((current) =>
            [
              {
                value,
                format: formatLabel(found.format),
                at: clock(new Date()),
              },
              ...current,
            ].slice(0, HISTORY_LENGTH)
          );
        }
        if (value) {
          last.current = { value, at: now };
        }
      } catch {
        // A frame that cannot be decoded is normal; the next one is tried.
      } finally {
        busy = false;
      }
    }, SCAN_INTERVAL_MS);
  }

  async function start() {
    if (phase !== "idle") {
      return;
    }
    if (!(window.isSecureContext && navigator.mediaDevices?.getUserMedia)) {
      setProblem("insecure");
      return;
    }
    setProblem(null);
    setPhase("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
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
      const reader = await createBarcodeReader({
        browser: browserDetector(),
        loadLibrary: loadZxingLibrary,
      });
      setDecoder(reader.source);
      setPhase("scanning");
      watch(reader);
    } catch (error) {
      stop();
      setProblem(cameraProblemFor(error));
    }
  }

  const latest = readings[0];

  return (
    <section className="flex flex-col gap-4">
      <div className="bg-px-surface relative aspect-[4/3] overflow-hidden rounded-3xl">
        <video
          aria-label="Camera"
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={video}
        />
        {phase === "scanning" ? (
          <div
            aria-hidden="true"
            className="border-px-green pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2"
          />
        ) : (
          <div className="text-px-muted absolute inset-0 grid place-items-center p-6 text-center text-sm">
            {phase === "starting"
              ? "Starting the camera…"
              : "The camera is off. Start it, then hold a ticket so its barcode sits inside the green box."}
          </div>
        )}
      </div>

      <button
        className="bg-px-green text-px-ink focus-visible:outline-px-paper rounded-xl px-4 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        disabled={phase === "starting"}
        onClick={phase === "scanning" ? stop : start}
        type="button"
      >
        {phase === "scanning" ? "Stop camera" : "Start camera"}
      </button>

      {problem ? (
        <p className="bg-px-stop rounded-xl px-4 py-3 text-sm" role="alert">
          {problem === "insecure"
            ? "The camera only works on a secure (https) address. Open the scanner from its https link."
            : CAMERA_PROBLEM_TEXT[problem]}
        </p>
      ) : null}

      <div
        aria-live="polite"
        className="bg-px-surface flex flex-col gap-2 rounded-2xl p-4"
      >
        <span className="text-px-muted text-xs font-medium tracking-wider uppercase">
          Last barcode read
        </span>
        {latest ? (
          <>
            <span className="font-mono text-2xl break-all">{latest.value}</span>
            <span className="text-px-muted text-sm">
              {latest.format} · {latest.value.length} characters · {latest.at}
            </span>
          </>
        ) : (
          <span className="text-px-muted text-sm">
            Nothing read yet. The value and its barcode type will show here.
          </span>
        )}
      </div>

      {readings.length > 1 ? (
        <ol className="divide-px-rule bg-px-surface flex flex-col divide-y rounded-2xl px-4">
          {readings.slice(1).map((reading) => (
            <li
              className="flex items-baseline justify-between gap-3 py-2"
              key={`${reading.at}-${reading.value}`}
            >
              <span className="font-mono text-sm break-all">
                {reading.value}
              </span>
              <span className="text-px-muted shrink-0 text-xs">
                {reading.format} · {reading.at}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {decoder ? (
        <p className="text-px-muted text-xs">
          Reading with{" "}
          {decoder === "browser"
            ? "this phone's built-in barcode reader"
            : "the scanner's own barcode reader"}
          . Nothing is sent anywhere.
        </p>
      ) : null}
    </section>
  );
}
