"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import Link from "next/link";
import { useActionState, useId } from "react";
import { savePhoneAction } from "@/app/profile/actions";
import type { PhoneFormState } from "@/lib/profile-form";

interface PhoneFormProps {
  /** The stored number, or empty. */
  phone: string;
}

/** One phone field, saved by a server action. Blank removes the number. */
export function PhoneForm({ phone }: PhoneFormProps) {
  const initial: PhoneFormState = {
    fieldErrors: {},
    formError: null,
    values: { phone },
  };
  const [state, action, pending] = useActionState(savePhoneAction, initial);
  const id = useId();
  const error = state.fieldErrors.phone;
  const describedBy = error ? `${id}-help ${id}-error` : `${id}-help`;

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Phone number</FieldLabel>
        <FieldDescription id={`${id}-help`}>
          Start with the country code. Grenada numbers start with +1 473.
          {phone ? " Leave this blank to remove your number." : ""}
        </FieldDescription>
        <Input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete="tel"
          defaultValue={state.values.phone}
          id={id}
          inputMode="tel"
          maxLength={40}
          name="phone"
          placeholder="+1 473 440 1234"
          type="tel"
        />
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      {state.formError ? (
        <p className="text-destructive text-sm" role="alert">
          {state.formError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save phone number"}
        </Button>
        <Link
          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
          href="/"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
