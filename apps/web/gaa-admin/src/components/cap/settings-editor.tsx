"use client";

import {
  type CapSettingsPublic,
  capUpdateCapSettings,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CapSettingsEditor({ initial }: { initial: CapSettingsPublic }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          await capUpdateCapSettings({
            body: {
              sender: String(form.get("sender")),
              sender_name: String(form.get("sender_name")),
              wmo_oid: String(form.get("wmo_oid") ?? "") || null,
              web: String(form.get("web") ?? "") || null,
              contact: String(form.get("contact") ?? "") || null,
              feed_limit: Number(form.get("feed_limit")),
              signing_enabled: form.get("signing_enabled") === "on",
              signing_certificate_ref:
                String(form.get("signing_certificate_ref") ?? "") || null,
            },
          }).unwrap();
          setMessage("CAP settings saved.");
          router.refresh();
        } catch {
          setMessage(
            "Settings were not confirmed saved. Check your permissions and connection, then reload before retrying."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Changes affect CAP sender details and publication configuration. Review
        the values before saving.
      </p>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
        {(
          [
            ["sender", "Sender identifier"],
            ["sender_name", "Sender name"],
            ["wmo_oid", "WMO OID"],
            ["web", "Website"],
            ["contact", "Contact"],
            ["signing_certificate_ref", "Signing certificate reference"],
          ] as const
        ).map(([name, label]) => (
          <div className="space-y-2" key={name}>
            <Label htmlFor={`cap-${name}`}>{label}</Label>
            <Input
              defaultValue={initial[name] ?? ""}
              id={`cap-${name}`}
              name={name}
              required={name === "sender" || name === "sender_name"}
              type={name === "web" ? "url" : "text"}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="cap-feed-limit">Feed limit</Label>
          <Input
            defaultValue={initial.feed_limit}
            id="cap-feed-limit"
            min={1}
            name="feed_limit"
            required
            type="number"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={initial.signing_enabled}
            name="signing_enabled"
            type="checkbox"
          />
          Enable signing
        </label>
        <Button type="submit">{busy ? "Saving…" : "Save settings"}</Button>
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
