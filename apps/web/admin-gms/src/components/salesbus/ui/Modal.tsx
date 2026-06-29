"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@grenmet/ui/components/ui/sheet";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <SheetContent
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0"
        showCloseButton={false}
        side="bottom"
      >
        <button
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted-foreground/20"
          onClick={onClose}
          type="button"
        >
          <X className="h-6 w-6" />
        </button>
        {title && (
          <SheetHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
            <SheetTitle className="text-lg sm:text-xl">{title}</SheetTitle>
          </SheetHeader>
        )}
        <div className="p-5 sm:p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
