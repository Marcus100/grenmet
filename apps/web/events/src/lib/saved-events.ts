"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Saved (bookmarked) events, kept in this browser until member accounts
 * persist them server-side. Storage access is guarded: private windows and
 * blocked storage fall back to an empty list.
 */

const STORAGE_KEY = "barrels-events:saved";
const CHANGE_EVENT = "barrels-events:saved-change";
const EMPTY: readonly string[] = [];

let cachedRaw: string | null = null;
let cachedList: readonly string[] = EMPTY;

export function parseSaved(raw: string | null): readonly string[] {
  if (!raw) {
    return EMPTY;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseSaved(raw);
  }
  return cachedList;
}

function write(slugs: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // Storage unavailable: the toggle simply won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSavedEvents() {
  const saved = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggle = useCallback((slug: string) => {
    const current = read();
    if (current.includes(slug)) {
      write(current.filter((item) => item !== slug));
      return;
    }
    write([...current, slug]);
  }, []);

  return { saved, toggle, isSaved: (slug: string) => saved.includes(slug) };
}
