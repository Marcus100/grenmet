"use client";

import { createContext, type ReactNode, use } from "react";

const SecurityUrlContext = createContext<string | null>(null);

/** Where the auth app's Security page lives; set by the server page. */
export function SecurityUrlProvider({
  children,
  url,
}: {
  children: ReactNode;
  url: string;
}) {
  return <SecurityUrlContext value={url}>{children}</SecurityUrlContext>;
}

export function useSecurityUrl(): string | null {
  return use(SecurityUrlContext);
}
