"use client";

import { createContext, type ReactNode, useContext } from "react";

const CapDeskUrl = createContext<string | undefined>(undefined);

/** Share the resolved destination without exposing server configuration. */
export function CapDeskNavigation({
  children,
  deskUrl,
}: {
  children: ReactNode;
  deskUrl: string | undefined;
}) {
  return <CapDeskUrl value={deskUrl}>{children}</CapDeskUrl>;
}

export function useCapDeskUrl(): string | undefined {
  return useContext(CapDeskUrl);
}
