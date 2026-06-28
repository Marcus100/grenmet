"use client";

import type { ReactNode } from "react";
import { useIsTabletLandscape } from "@/hooks/salesbus";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { SideNav } from "./SideNav";

interface AppShellProps {
  cartItemCount?: number;
  children: ReactNode;
}

export function AppShell({ children, cartItemCount = 0 }: AppShellProps) {
  const isTabletLandscape = useIsTabletLandscape();

  return (
    <div className="flex min-h-dvh min-h-screen flex-col bg-gm-surface">
      <Header cartItemCount={cartItemCount} />

      <div className="flex flex-1 overflow-hidden">
        {/* Side navigation for tablet landscape */}
        {isTabletLandscape && <SideNav />}

        <main
          className={`flex-1 overflow-y-auto ${isTabletLandscape ? "pb-4" : "pb-20"}
          `}
        >
          {children}
        </main>
      </div>

      {/* Bottom navigation for portrait mode */}
      {!isTabletLandscape && <BottomNav />}
    </div>
  );
}
