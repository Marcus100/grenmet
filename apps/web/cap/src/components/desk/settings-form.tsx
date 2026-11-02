"use client";

import type {
  CapSettingsPublic,
  CapSettingsUpdate,
} from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { saveCapSettings } from "@/app/desk/settings/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";

/** Text fields in the order they appear on the form. */
const TEXT_FIELDS = [
  { label: "Sender identifier", name: "sender", required: true },
  { label: "Sender name", name: "sender_name", required: true },
  { label: "WMO OID", name: "wmo_oid", required: false },
  { label: "Website", name: "web", required: false, type: "url" },
  { label: "Contact", name: "contact", required: false },
  {
    label: "Signing certificate reference",
    name: "signing_certificate_ref",
    required: false,
  },
] as const;

type TextName = (typeof TEXT_FIELDS)[number]["name"];

/** Empty text means "no value", which the API stores as null. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toUpdate(form: FormData): CapSettingsUpdate {
  const text = (name: TextName) => String(form.get(name) ?? "");
  return {
    contact: blankToNull(text("contact")),
    feed_limit: Number(form.get("feed_limit")),
    sender: text("sender").trim(),
    sender_name: text("sender_name").trim(),
    signing_certificate_ref: blankToNull(text("signing_certificate_ref")),
    signing_enabled: form.get("signing_enabled") === "on",
    web: blankToNull(text("web")),
    wmo_oid: blankToNull(text("wmo_oid")),
  };
}

/**
 * Editor for the CAP sender defaults. A save is two steps: the form collects
 * the values, then a confirmation shows exactly what will change. Only the
 * confirmation calls the server action, which checks the gate and the
 * `cap.settings.manage` permission again before FastAPI is called.
 */
export function SettingsForm({ initial }: { initial: CapSettingsPublic }) {
  const router = useRouter();
  const idPrefix = useId();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CapSettingsUpdate | null>(null);
  const [error, setError] = useState<DeskError | null>(null);
  const [message, setMessage] = useState("");

  function confirmSave() {
    if (!draft) return;
    const body = draft;
    setDraft(null);
    setMessage("");
    setError(null);
    startTransition(async () => {
      const result = await saveCapSettings(body);
      if (result.ok) {
        setMessage("CAP settings saved.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      className="space-y-6 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setMessage("");
        setDraft(toUpdate(new FormData(event.currentTarget)));
      }}
    >
      <p className="text-body-sm text-muted-foreground">
        These details appear on every warning issued from now on. Review them
        before saving; you will be asked to confirm.
      </p>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={pending}>
        {TEXT_FIELDS.map((field) => (
          <div className="space-y-2" key={field.name}>
            <Label htmlFor={`${idPrefix}-${field.name}`}>{field.label}</Label>
            <Input
              defaultValue={initial[field.name] ?? ""}
              id={`${idPrefix}-${field.name}`}
              name={field.name}
              required={field.required}
              type={"type" in field ? field.type : "text"}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-feed_limit`}>Feed limit</Label>
          <Input
            defaultValue={initial.feed_limit}
            id={`${idPrefix}-feed_limit`}
            max={500}
            min={1}
            name="feed_limit"
            required
            type="number"
          />
        </div>
        <div className="flex items-center gap-2 self-end">
          <input
            defaultChecked={initial.signing_enabled}
            id={`${idPrefix}-signing_enabled`}
            name="signing_enabled"
            type="checkbox"
          />
          <Label htmlFor={`${idPrefix}-signing_enabled`}>Enable signing</Label>
        </div>
        <div className="sm:col-span-2">
          <Button disabled={pending} type="submit">
            {pending ? "Saving…" : "Review and save settings"}
          </Button>
        </div>
      </fieldset>
      <DeskErrorNotice error={error} />
      {message ? (
        <p className="text-body-sm" role="status">
          {message}
        </p>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        open={draft !== null}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Save these CAP settings?</AlertDialogTitle>
          <AlertDialogDescription>
            Sender identifier {draft?.sender} and sender name{" "}
            {draft?.sender_name} will be used on new warnings. Signing is{" "}
            {draft?.signing_enabled ? "on" : "off"}.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>
              Save settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
