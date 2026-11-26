import { Button } from "@barrelsgd/ui/components/ui/button";
import { FieldError } from "@barrelsgd/ui/components/ui/field";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A settings-style form block: the label and its explanation on the left, the
 * fields on the right (stacked on phones). Put each field's own error next to
 * the field with `FieldError`; `error` is for an error about the whole block.
 */
export function FormSection({
  children,
  className,
  description,
  error,
  title,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly title: ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 border-b py-6 first:pt-0 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-sm leading-snug font-medium">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-4">
        {children}
        <FieldError>{error}</FieldError>
      </div>
    </section>
  );
}

/**
 * The form's Save button. While `pending` it is disabled, so it never submits
 * twice, and it says so in words.
 */
export function SaveButton({
  children = "Save",
  className,
  pending = false,
  pendingLabel = "Saving…",
}: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
}) {
  return (
    <Button
      aria-busy={pending}
      className={cn("min-h-11 w-full sm:min-h-0 sm:w-auto", className)}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <Spinner aria-hidden="true" role="presentation" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
