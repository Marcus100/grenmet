"use client";

import { type ReactNode, type RefObject, useId, useState } from "react";
import { Drawer } from "vaul";

interface SheetProps {
  readonly children: ReactNode;
  /** Where focus goes when the sheet opens, such as its first field. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title: string;
}

/**
 * A bottom sheet that behaves like a phone's own: it slides up, follows the
 * finger, and a drag down, a tap outside or Escape closes it. Focus starts in
 * `initialFocus` (or the sheet), stays inside, and goes back to the button
 * that opened it.
 *
 * The children are created afresh on every opening, even one that starts
 * while the sheet is still sliding away, so a half-typed value or an old error
 * never carries over.
 */
export function Sheet({
  children,
  initialFocus,
  onClose,
  open,
  title,
}: SheetProps) {
  const titleId = useId();
  const [wasOpen, setWasOpen] = useState(open);
  const [opening, setOpening] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpening(opening + 1);
    }
  }

  return (
    <Drawer.Root
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Drawer.Content
          aria-describedby={undefined}
          aria-labelledby={titleId}
          className="bg-pwa-surface fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex flex-col gap-4 rounded-3xl px-5 pt-3 pb-5 outline-none"
          onOpenAutoFocus={(event) => {
            if (initialFocus) {
              event.preventDefault();
              initialFocus.current?.focus();
            }
          }}
        >
          <Drawer.Handle className="bg-pwa-rule! mx-auto h-1.5! w-12! rounded-full" />
          <Drawer.Title className="text-xl font-semibold" id={titleId}>
            {title}
          </Drawer.Title>
          <div className="contents" key={opening}>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
