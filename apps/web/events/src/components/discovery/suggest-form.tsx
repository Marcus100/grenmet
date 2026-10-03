"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PARISH_LABELS,
  PARISHES,
} from "@/domain/labels";

/** Resident suggestions go to review before publication (product strategy). */
export function SuggestForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div
        className="flex gap-3 rounded-2xl bg-events-lime p-5 text-events-ink"
        role="status"
      >
        <CircleCheck className="size-6 shrink-0" />
        <div>
          <p className="font-semibold text-body-base">
            Thanks — this is a preview
          </p>
          <p className="text-body">
            When suggestions go live, our team will review each one before it
            appears on the calendar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="suggest-title">Event name</FieldLabel>
          <Input id="suggest-title" name="title" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="suggest-date">Date</FieldLabel>
            <Input id="suggest-date" name="date" required type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor="suggest-time">Start time</FieldLabel>
            <Input id="suggest-time" name="time" type="time" />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="suggest-venue">Venue</FieldLabel>
          <Input id="suggest-venue" name="venue" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="suggest-category">Category</FieldLabel>
            <NativeSelect
              className="w-full"
              id="suggest-category"
              name="category"
            >
              {CATEGORIES.map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="suggest-parish">Parish</FieldLabel>
            <NativeSelect className="w-full" id="suggest-parish" name="parish">
              {PARISHES.map((parish) => (
                <NativeSelectOption key={parish} value={parish}>
                  {PARISH_LABELS[parish]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="suggest-link">Where did you see it?</FieldLabel>
          <Input
            id="suggest-link"
            name="source"
            placeholder="Flyer, Instagram link, radio…"
          />
          <FieldDescription>
            Helps us confirm details with the organiser.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="suggest-notes">Anything else</FieldLabel>
          <Textarea id="suggest-notes" name="notes" rows={3} />
        </Field>
        <Button className="h-11" size="lg" type="submit">
          Send for review
        </Button>
      </FieldGroup>
    </form>
  );
}
