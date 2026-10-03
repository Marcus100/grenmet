"use client";

import type { TimetableVersionDetail } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { errorMessage, startDraft } from "./api";

export function StartDraftButton() {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const mutation = useMutation<TimetableVersionDetail, unknown, string>({
    mutationFn: (value) => startDraft({ label: value }),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const draft = await mutation.mutateAsync(label);
      router.push(`/bus/timetable/${draft.version.id}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not start a draft"));
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FilePlus2 /> Start a draft
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Start a timetable draft</DialogTitle>
              <DialogDescription>
                The draft starts as a copy of the timetable in force. Nobody
                sees your changes until you publish them.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`${id}-label`}>Draft name</FieldLabel>
              <Input
                id={`${id}-label`}
                maxLength={200}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. November shift changes"
                required
                value={label}
              />
            </Field>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={mutation.isPending} type="submit">
                Start draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
