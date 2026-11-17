interface WakeLockNavigator {
  readonly wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
}

/**
 * Keeps the screen on while the app is in use (scanning at a gate, a driver's
 * route), where the browser supports a wake lock.
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
      // Refused or unsupported: the app still works, the screen may sleep.
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
