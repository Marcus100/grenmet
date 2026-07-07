"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { queryClient } from "@/lib/query-client";

/**
 * Devtools are lazy-loaded so the root client boundary (compiled for every
 * route) doesn't pay for them. Call `window.toggleRqDevtools()` in the browser
 * console to load and show them on demand (official TanStack pattern:
 * tanstack.com/query/latest/docs/framework/react/devtools).
 */
const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools/production").then((mod) => ({
    default: mod.ReactQueryDevtools,
  }))
);

declare global {
  interface Window {
    toggleRqDevtools?: () => void;
  }
}

function useDevtoolsToggle(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    window.toggleRqDevtools = () => setShow((prev) => !prev);
    return () => {
      window.toggleRqDevtools = undefined;
    };
  }, []);
  return show;
}

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const showDevtools = useDevtoolsToggle();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {showDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
