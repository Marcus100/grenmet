"use client";

// False in server HTML and during hydration, true once the client has taken
// over. A form with only an onSubmit handler would otherwise fall back to a
// native GET before hydration and put its fields (passwords) in the URL. A
// disabled default submit button blocks click and Enter submission.

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
