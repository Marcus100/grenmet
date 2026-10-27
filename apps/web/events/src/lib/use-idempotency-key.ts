"use client";

import { useEffect, useRef } from "react";

/**
 * One Idempotency-Key per attempted request. The key is made on mount, kept
 * while the same content is retried after a timeout or server fault (the first
 * try may have landed, and the same key replays it), and rotated by `rotate`
 * after a refusal or a success. A different `signature` (the content being
 * sent) always gets a new key, because the API refuses a reused key with a
 * different body.
 */
export function useIdempotencyKey() {
  const state = useRef<{ key: string; signature: string | null }>({
    key: "",
    signature: null,
  });

  useEffect(() => {
    state.current.key ||= globalThis.crypto.randomUUID();
  }, []);

  return {
    keyFor(signature: string): string {
      const current = state.current;
      if (
        !current.key ||
        (current.signature && current.signature !== signature)
      ) {
        current.key = globalThis.crypto.randomUUID();
      }
      current.signature = signature;
      return current.key;
    },
    rotate(): void {
      state.current = { key: globalThis.crypto.randomUUID(), signature: null };
    },
  };
}
