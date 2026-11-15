import { reportError } from "@/lib/report-error";

/**
 * The two signals a gate hears and feels. Colour carries the meaning on
 * screen; sound and vibration only repeat it, and iPhones do not vibrate.
 */
export type Signal = "admitted" | "refused";

interface ToneStep {
  readonly durationMs: number;
  readonly frequency: number;
  readonly startMs: number;
  readonly type: OscillatorType;
}

/** Admitted: two rising beeps. Refused: one low, long buzz. Never alike. */
export const TONES: Record<Signal, readonly ToneStep[]> = {
  admitted: [
    { frequency: 880, type: "sine", startMs: 0, durationMs: 120 },
    { frequency: 1320, type: "sine", startMs: 140, durationMs: 180 },
  ],
  refused: [{ frequency: 170, type: "sawtooth", startMs: 0, durationMs: 420 }],
};

/** Vibration patterns in milliseconds, where the browser supports them. */
export const VIBRATION_MS: Record<Signal, readonly number[]> = {
  admitted: [60],
  refused: [250, 120, 250],
};

const PEAK_GAIN = 0.4;
const RAMP_SECONDS = 0.01;

/** The part of an audio context this app uses, so tests can use a fake. */
export interface ToneContext {
  createGain: () => GainNode;
  createOscillator: () => OscillatorNode;
  readonly currentTime: number;
  readonly destination: AudioNode;
  resume: () => Promise<void>;
  readonly state: string;
}

export interface SoundPlayer {
  readonly play: (signal: Signal) => void;
  /** Call from a tap. iPhone only lets audio start from a user gesture. */
  readonly unlock: () => void;
}

type WindowWithLegacyAudio = Window & {
  webkitAudioContext?: new () => AudioContext;
};

/** A real audio context when the browser has one, otherwise null. */
export function browserToneContext(): ToneContext | null {
  try {
    const legacy = (window as WindowWithLegacyAudio).webkitAudioContext;
    const Constructor: (new () => AudioContext) | undefined =
      window.AudioContext ?? legacy;
    return Constructor ? new Constructor() : null;
  } catch (error) {
    reportError(error, "sound");
    return null;
  }
}

/**
 * Plays the two signals. Created without touching audio; the context is only
 * made on the first unlock, so a browser without audio simply stays silent.
 */
export function createSoundPlayer(
  makeContext: () => ToneContext | null = browserToneContext
): SoundPlayer {
  let context: ToneContext | null = null;
  let attempted = false;
  return {
    unlock() {
      if (!attempted) {
        attempted = true;
        context = makeContext();
      }
      if (context?.state === "suspended") {
        context.resume().catch(() => undefined);
      }
    },
    play(signal) {
      if (!context) {
        return;
      }
      const start = context.currentTime;
      for (const step of TONES[signal]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const from = start + step.startMs / 1000;
        const to = from + step.durationMs / 1000;
        oscillator.type = step.type;
        oscillator.frequency.value = step.frequency;
        gain.gain.setValueAtTime(0.0001, from);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, from + RAMP_SECONDS);
        gain.gain.setValueAtTime(PEAK_GAIN, to - RAMP_SECONDS);
        gain.gain.exponentialRampToValueAtTime(0.0001, to);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(from);
        oscillator.stop(to + RAMP_SECONDS);
      }
    },
  };
}

/** The part of the navigator that vibrates; absent on most iPhones. */
interface VibrationHost {
  readonly vibrate?: (pattern: number[]) => boolean;
}

/** Vibrates where the phone allows it; a no-op everywhere else. */
export function vibrate(
  signal: Signal,
  nav: VibrationHost | undefined = globalThis.navigator
): void {
  if (nav && typeof nav.vibrate === "function") {
    nav.vibrate([...VIBRATION_MS[signal]]);
  }
}

interface WakeLockNavigator {
  readonly wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
}

/**
 * Keeps the screen on while scanning, where the browser supports a wake lock.
 * Asks again when the phone comes back to the app, since the lock drops when
 * the page is hidden. Returns the function that lets the screen sleep again.
 */
export function holdScreenAwake(
  nav: WakeLockNavigator | undefined = globalThis.navigator,
  doc: Document | undefined = globalThis.document
): () => void {
  if (!(nav?.wakeLock && doc)) {
    return () => undefined;
  }
  let wanted = true;
  let sentinel: WakeLockSentinel | null = null;
  const acquire = async () => {
    if (!wanted || doc.visibilityState !== "visible" || !nav.wakeLock) {
      return;
    }
    try {
      const lock = await nav.wakeLock.request("screen");
      if (wanted) {
        sentinel = lock;
      } else {
        await lock.release();
      }
    } catch {
      // Refused or unsupported: the scanner still works, the screen may sleep.
    }
  };
  const onVisibility = () => {
    acquire().catch(() => undefined);
  };
  doc.addEventListener("visibilitychange", onVisibility);
  onVisibility();
  return () => {
    wanted = false;
    doc.removeEventListener("visibilitychange", onVisibility);
    sentinel?.release().catch(() => undefined);
    sentinel = null;
  };
}
