"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { resubmitOrganiser } from "@/data/actions";

/**
 * Shown on /dash while the organiser is unverified. The API tells the
 * organiser only `verified: false`: it does not yet say whether the request is
 * pending or rejected, nor why. So the notice keeps the awaiting-review copy
 * and offers a safe resubmit; the API answers "unchanged" when nothing was
 * rejected.
 */
export function OrganiserVerificationNotice({ name }: { name: string }) {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();
  const [outcome, setOutcome] = useState<"resubmitted" | "unchanged" | null>(
    null
  );
  const result = useRef<HTMLParagraphElement>(null);

  const resubmit = async () => {
    setOutcome(null);
    const response = await perform(resubmitOrganiser);
    if (response.ok) {
      setOutcome(response.data);
      router.refresh();
    }
  };

  // Move focus to the outcome message once it has mounted.
  useEffect(() => {
    if (outcome || error) {
      result.current?.focus();
    }
  }, [outcome, error]);

  return (
    <section
      aria-label="Organiser verification"
      className="bg-muted text-body text-muted-foreground space-y-2 px-4 py-3 text-center"
    >
      <p role="status">{name} is awaiting verification by the Barrels team.</p>
      <p>
        If Barrels declined the request, resubmit it for another review. The
        reason isn't shown here; ask Barrels support if you need it.
      </p>
      <Button
        className="h-11"
        disabled={pending}
        onClick={resubmit}
        type="button"
        variant="outline"
      >
        Resubmit for review
      </Button>
      {error ? (
        <p className="text-destructive" ref={result} role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p ref={result} role="status" tabIndex={-1}>
          {outcome === "resubmitted"
            ? "Sent back for review. The Barrels team will look at it again."
            : "Nothing to resubmit: the request isn't rejected, so it is still in review."}
        </p>
      ) : null}
    </section>
  );
}
