import type { Metadata } from "next";
import { SuggestForm } from "@/components/discovery/suggest-form";

export const metadata: Metadata = {
  title: "Suggest an event",
  description:
    "Tell us about an event in Grenada that's missing from the calendar.",
};

export default function SuggestPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-heading-base sm:text-heading-md font-bold tracking-tight">
          Suggest an event
        </h1>
        <p className="text-body-base text-muted-foreground mt-2">
          Know something we're missing? Send it in. Suggestions are checked
          before they're published; organisers can claim and verify their
          listing.
        </p>
      </div>
      <SuggestForm />
    </div>
  );
}
