"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { SessionUserPublic } from "../types";

const SessionUserContext = createContext<SessionUserPublic | null>(null);

export function SessionUserProvider({
  user,
  children,
}: {
  user: SessionUserPublic;
  children: ReactNode;
}) {
  return <SessionUserContext value={user}>{children}</SessionUserContext>;
}

export function useSessionUser(): SessionUserPublic {
  const user = useContext(SessionUserContext);
  if (!user) {
    throw new Error(
      "useSessionUser must be used within a <SessionUserProvider>",
    );
  }
  return user;
}
