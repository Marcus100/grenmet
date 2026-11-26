"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import Link from "next/link";
import { useActionState, useId } from "react";
import { saveNameAction } from "@/app/profile/actions";
import type { NameFormState } from "@/lib/profile-form";

interface NameFormProps {
  firstName: string;
  lastName: string;
}

/** First and last name, saved by a server action. Errors sit beside their field. */
export function NameForm({ firstName, lastName }: NameFormProps) {
  const initial: NameFormState = {
    fieldErrors: {},
    formError: null,
    values: { first_name: firstName, last_name: lastName },
  };
  const [state, action, pending] = useActionState(saveNameAction, initial);
  const firstId = useId();
  const lastId = useId();
  const firstError = state.fieldErrors.first_name;
  const lastError = state.fieldErrors.last_name;

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      <Field data-invalid={firstError ? true : undefined}>
        <FieldLabel htmlFor={firstId}>First name</FieldLabel>
        <Input
          aria-describedby={firstError ? `${firstId}-error` : undefined}
          aria-invalid={firstError ? true : undefined}
          autoComplete="given-name"
          defaultValue={state.values.first_name}
          id={firstId}
          maxLength={100}
          name="first_name"
          required
        />
        {firstError ? (
          <FieldError id={`${firstId}-error`}>{firstError}</FieldError>
        ) : null}
      </Field>
      <Field data-invalid={lastError ? true : undefined}>
        <FieldLabel htmlFor={lastId}>Last name (optional)</FieldLabel>
        <Input
          aria-describedby={lastError ? `${lastId}-error` : undefined}
          aria-invalid={lastError ? true : undefined}
          autoComplete="family-name"
          defaultValue={state.values.last_name}
          id={lastId}
          maxLength={100}
          name="last_name"
        />
        {lastError ? (
          <FieldError id={`${lastId}-error`}>{lastError}</FieldError>
        ) : null}
      </Field>
      {state.formError ? (
        <p className="text-destructive text-sm" role="alert">
          {state.formError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save name"}
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
