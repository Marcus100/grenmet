"use client";

import { useTheme } from "next-themes";
import { type ComponentPropsWithoutRef, useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

function ThemeIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
      <path
        clipRule="evenodd"
        d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-5-8a5 5 0 0 0 5 5V7a5 5 0 0 0-5 5Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored theme is only known in the browser: render nothing on the
  // server and during hydration so the markup matches.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  if (!hydrated) {
    return null;
  }
  const otherTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      className="group absolute top-4 right-4 z-50 -m-2.5 p-2.5"
      onClick={() => setTheme(otherTheme)}
      type="button"
    >
      <span className="sr-only">Switch to {otherTheme} theme</span>
      <ThemeIcon className="h-6 w-6 fill-white opacity-50 transition-opacity group-hover:opacity-100 lg:fill-gray-900 lg:dark:fill-white" />
    </button>
  );
}
