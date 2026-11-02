"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { duplicateAlertAsDraft } from "@/app/desk/alerts/[id]/duplicate-action";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";

/**
 * Copies this alert into a new Draft and opens it. The copy is not an Update
 * of this warning, and the text says so. Without cap.alert.create the button
 * stays visible, disabled, with the reason.
 */
export function DuplicateAlertButton({
  alertId,
  canCreate,
}: {
  alertId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const noteId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeskError | null>(null);

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4 text-body-sm">
      <h2 className="font-semibold">Use this as a starting point</h2>
      <p className="text-muted-foreground" id={noteId}>
        A copy is a new draft with its own identifier. It is not an Update of
        this warning and cannot replace it.
      </p>
      {canCreate ? (
        <Button
          aria-describedby={noteId}
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await duplicateAlertAsDraft(alertId);
              if (result.ok) {
                router.push(`/desk/alerts/${result.data.id}/edit`);
              } else {
                setError(result.error);
              }
            });
          }}
          type="button"
          variant="outline"
        >
          {pending ? "Copying…" : "Duplicate as draft"}
        </Button>
      ) : (
        <p role="status">
          No access to duplicate alerts. This needs the cap.alert.create
          permission.
        </p>
      )}
      <DeskErrorNotice error={error} />
    </section>
  );
}
