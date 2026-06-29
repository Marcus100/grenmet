"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "@grenmet/ui/lib/utils";
import { XIcon } from "lucide-react";
import type * as React from "react";

function DialogRoot({ ...props }: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close data-slot="dialog-close" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal data-slot="dialog-portal" {...props} />;
}

function DialogBackdrop({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Backdrop>) {
  return (
    <Dialog.Backdrop
      className={cn(
        "data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/50 transition-opacity data-closed:animate-out data-open:animate-in",
        className
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog.Popup> & {
  showCloseButton?: boolean;
}) {
  return (
    <Dialog.Portal>
      <DialogBackdrop />
      <Dialog.Popup
        className={cn(
          "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 fixed top-1/2 right-4 left-4 z-50 grid -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 data-closed:animate-out data-open:animate-in sm:right-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2",
          className
        )}
        data-slot="dialog-content"
        {...props}
      >
        {children}
        {showCloseButton && (
          <Dialog.Close
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-open:bg-accent data-open:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
            data-slot="dialog-close"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("font-semibold text-lg leading-none", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export {
  DialogBackdrop as DialogOverlay,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogRoot as Dialog,
  DialogTitle,
  DialogTrigger,
};
