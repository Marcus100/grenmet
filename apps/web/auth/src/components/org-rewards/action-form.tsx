"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type FormAction,
  type FormState,
  IDLE,
} from "@/app/organisations/[organisationId]/rewards/state";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  noticeBoxClass,
  primaryButtonClass,
} from "@/components/form-styles";

export const compactButtonClass =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted disabled:opacity-60";

export const selectClass = inputClass;

interface ActionFormProps {
  readonly action: FormAction;
  readonly children?: ReactNode;
  readonly className?: string;
  /** A compact form is one small button, such as pause or resume. */
  readonly compact?: boolean;
  readonly organisationId: string;
  readonly pendingLabel: string;
  readonly submitLabel: string;
  /** Returns a message to stop the submit, or null to let it through. */
  readonly validate?: (formData: FormData) => string | null;
}

/**
 * A form that posts to a server action and reports the outcome beside itself.
 * It submits through `onSubmit` so a rejected entry stays in the fields.
 */
export function ActionForm({
  action,
  children,
  className,
  compact = false,
  organisationId,
  pendingLabel,
  submitLabel,
  validate,
}: ActionFormProps) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const messageId = useId();

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const problem = validate?.(data) ?? null;
    setClientError(problem);
    if (problem) return;
    startTransition(async () => {
      await dispatch(data);
    });
  }

  let showing: FormState | null = state.status === "idle" ? null : state;
  if (clientError) showing = { message: clientError, status: "error" };

  return (
    <form
      aria-describedby={showing ? messageId : undefined}
      className={cn(compact ? "space-y-2" : "space-y-4", className)}
      noValidate
      onSubmit={onSubmit}
      ref={formRef}
    >
      <input name="organisation_id" type="hidden" value={organisationId} />
      {children}
      <button
        aria-disabled={pending}
        className={compact ? compactButtonClass : primaryButtonClass}
        disabled={pending}
        type="submit"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
      <div aria-live="polite" id={messageId}>
        {showing ? (
          <p
            className={
              showing.status === "error" ? errorBoxClass : noticeBoxClass
            }
            role={showing.status === "error" ? "alert" : "status"}
          >
            <span className="font-medium">
              {showing.status === "error" ? "Not done: " : "Done: "}
            </span>
            {showing.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function Field({
  children,
  hint,
  id,
  label,
}: {
  readonly children: ReactNode;
  readonly hint?: string;
  readonly id: string;
  readonly label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-muted-foreground text-sm" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
