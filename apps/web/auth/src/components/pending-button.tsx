"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { primaryButtonClass } from "@/components/form-styles";

/** Submit button that disables itself while its parent form action runs. */
export function PendingButton({
  children,
  pendingLabel,
}: {
  readonly children: ReactNode;
  readonly pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending}
      className={primaryButtonClass}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
