"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Check, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { updateProfile } from "@/data/actions";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  INTENT_LABELS,
  PARISH_LABELS,
  PARISHES,
} from "@/domain/labels";
import type { EventCategory, Intent, Parish } from "@/domain/types";
import { useMemberAction } from "./use-member-action";

const INTENTS = Object.keys(INTENT_LABELS) as Intent[];

export function togglePick<T>(list: readonly T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((value) => value !== item)
    : [...list, item];
}

/**
 * First-run onboarding. Saves interests, intents and parish to the member's
 * profile; they show on the profile and shape group suggestions.
 */
export function OnboardingForm({
  initialInterests,
  initialIntents,
  initialParish,
}: {
  initialInterests: readonly EventCategory[];
  initialIntents: readonly Intent[];
  initialParish: Parish;
}) {
  const [interests, setInterests] = useState<EventCategory[]>([
    ...initialInterests,
  ]);
  const [intents, setIntents] = useState<Intent[]>([...initialIntents]);
  const [parish, setParish] = useState<Parish>(initialParish);
  const [done, setDone] = useState(false);
  const { error, pending, perform } = useMemberAction();

  if (done) {
    return (
      <div
        className="space-y-4 rounded-2xl bg-events-lime p-6 text-events-ink"
        role="status"
      >
        <p className="flex items-center gap-2 font-display font-semibold text-heading-sm">
          <CircleCheck className="size-6" />
          You're all set
        </p>
        <p className="text-body">
          We'll use these to suggest events, groups and people.
        </p>
        <Link className="inline-block font-semibold underline" href="/">
          Start exploring
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await perform(() =>
          updateProfile({ interests, intents, parish })
        );
        if (result.ok) {
          setDone(true);
        }
      }}
    >
      <fieldset className="space-y-3">
        <legend className="font-display font-semibold text-heading-sm">
          What are you into?
        </legend>
        <p className="text-body text-muted-foreground">Pick at least one.</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={CATEGORY_LABELS[category]}
              onToggle={() =>
                setInterests((list) => togglePick(list, category))
              }
              selected={interests.includes(category)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-display font-semibold text-heading-sm">
          Where are you based?
        </legend>
        <label className="sr-only" htmlFor="welcome-parish">
          Parish
        </label>
        <NativeSelect
          className="w-full sm:w-80"
          id="welcome-parish"
          onChange={(event) =>
            setParish(
              PARISHES.find((value) => value === event.target.value) ?? parish
            )
          }
          value={parish}
        >
          {PARISHES.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {PARISH_LABELS[value]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-display font-semibold text-heading-sm">
          What are you open to?
        </legend>
        <p className="text-body text-muted-foreground">
          Shown on your profile so the right people say hello. Optional.
        </p>
        <div className="flex flex-wrap gap-2">
          {INTENTS.map((intent) => (
            <Chip
              key={intent}
              label={INTENT_LABELS[intent]}
              onToggle={() => setIntents((list) => togglePick(list, intent))}
              selected={intents.includes(intent)}
            />
          ))}
        </div>
      </fieldset>

      <Button
        className="h-11 w-full sm:w-auto"
        disabled={interests.length === 0 || pending}
        size="lg"
        type="submit"
      >
        Save and continue
      </Button>
      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Chip({
  label,
  onToggle,
  selected,
}: {
  label: string;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-medium text-body transition-colors",
        selected
          ? "border-events-ink bg-events-ink text-white"
          : "border-border bg-card hover:border-foreground"
      )}
      onClick={onToggle}
      type="button"
    >
      {selected ? <Check className="size-4" /> : null}
      {label}
    </button>
  );
}
