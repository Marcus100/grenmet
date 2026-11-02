"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion } from "motion/react";
import { createContext, Suspense, useContext } from "react";
import { create } from "zustand";

import { Header } from "@/components/Header";
import { Navigation } from "@/components/Navigation";

function MenuIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      viewBox="0 0 10 9"
      {...props}
    >
      <path d="M.5 1h9M.5 8h9M.5 4.5h9" />
    </svg>
  );
}

function XIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      viewBox="0 0 10 9"
      {...props}
    >
      <path d="m1.5 1 7 7M8.5 1l-7 7" />
    </svg>
  );
}

const IsInsideMobileNavigationContext = createContext(false);

function MobileNavigationDialog({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) {
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={isOpen}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 top-14 z-50 bg-zinc-400/20 backdrop-blur-xs transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-ending-style:duration-200 data-ending-style:ease-in data-starting-style:opacity-0 lg:hidden dark:bg-black/40" />

        {/* The popup has no box of its own so the backdrop stays clickable.
            Its visibility transition keeps it mounted while the panel slides out. */}
        <Dialog.Popup
          aria-label="Navigation"
          className="group z-50 transition-[visibility] duration-500 data-ending-style:invisible lg:hidden"
        >
          <Header className="duration-300 ease-out group-data-ending-style:opacity-0 group-data-ending-style:duration-200 group-data-ending-style:ease-in group-data-starting-style:opacity-0" />

          <motion.div
            className="fixed top-14 bottom-0 left-0 z-50 w-full overflow-y-auto bg-white px-4 pt-6 pb-4 shadow-lg ring-1 shadow-zinc-900/10 ring-zinc-900/7.5 transition-transform duration-500 ease-in-out group-data-ending-style:-translate-x-full group-data-starting-style:-translate-x-full min-[416px]:max-w-sm sm:px-6 sm:pb-10 dark:bg-zinc-900 dark:ring-zinc-800"
            layoutScroll
          >
            <Navigation />
          </motion.div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function useIsInsideMobileNavigation() {
  return useContext(IsInsideMobileNavigationContext);
}

export const useMobileNavigationStore = create<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

export function MobileNavigation() {
  const isInsideMobileNavigation = useIsInsideMobileNavigation();
  const { isOpen, toggle, close } = useMobileNavigationStore();
  const ToggleIcon = isOpen ? XIcon : MenuIcon;

  return (
    <IsInsideMobileNavigationContext.Provider value={true}>
      <button
        aria-label="Toggle navigation"
        className="relative flex size-6 items-center justify-center rounded-md transition hover:bg-zinc-900/5 dark:hover:bg-white/5"
        onClick={toggle}
        type="button"
      >
        <span className="absolute size-12 pointer-fine:hidden" />
        <ToggleIcon className="w-2.5 stroke-zinc-900 dark:stroke-white" />
      </button>
      {!isInsideMobileNavigation && (
        <Suspense fallback={null}>
          <MobileNavigationDialog close={close} isOpen={isOpen} />
        </Suspense>
      )}
    </IsInsideMobileNavigationContext.Provider>
  );
}
