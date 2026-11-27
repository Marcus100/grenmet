"use client";

import { Label } from "@barrelsgd/ui/components/ui/label";
import { useState } from "react";
import { ABOUT_MAX, aboutLength } from "@/lib/about-text";

/**
 * What the business says about itself: plain text saved with the profile's own
 * Save button, shown above the services on its public booking page. Line breaks
 * are kept; the counter matches the limit the API enforces.
 */
export function AboutField({ initial }: { initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const count = aboutLength(text);
  const tooLong = count > ABOUT_MAX;
  return (
    <fieldset className="border-border space-y-3 border-t pt-4">
      <legend className="pt-4 font-medium">About your business</legend>
      <p className="text-muted-foreground text-sm">
        A few lines customers read above your services: what you do, how long
        you have done it, what to expect. Plain text; line breaks are kept.
        Leave it empty to show nothing.
      </p>
      <div className="grid gap-1.5">
        <Label className="flex-col items-start gap-1.5" htmlFor="profile-about">
          About text
        </Label>
        <textarea
          aria-describedby="profile-about-count"
          aria-invalid={tooLong || undefined}
          className="border-border min-h-32 w-full rounded-md border p-3 text-base"
          id="profile-about"
          name="about"
          onChange={(event) => setText(event.target.value)}
          value={text}
        />
        <p className="text-muted-foreground text-sm" id="profile-about-count">
          {count} of {ABOUT_MAX} characters
        </p>
        {tooLong ? (
          <p className="text-destructive text-base font-medium" role="alert">
            Shorten it to {ABOUT_MAX} characters.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
