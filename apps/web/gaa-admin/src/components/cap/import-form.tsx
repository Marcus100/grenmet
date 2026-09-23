"use client";

import { capImportAlert } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CapImportForm() {
  const router = useRouter();
  const [source, setSource] = useState<"xml" | "url">("xml");
  const [value, setValue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !reviewed || !value.trim()) return;
        setBusy(true);
        setError("");
        try {
          const alert = await capImportAlert({
            body: { source, value: value.trim() },
          }).unwrap();
          router.push(`/cap/admin/${encodeURIComponent(alert.id)}`);
        } catch {
          setError(
            "Import was not confirmed. Check the XML or public source URL and your permissions. Check existing alerts before retrying."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Import creates a saved alert; duplicate identifiers are rejected. Review
        and validate its saved contents before any publication; importing does
        not confirm delivery.
      </p>
      <fieldset className="space-y-4" disabled={busy}>
        <div className="flex gap-4">
          {(["xml", "url"] as const).map((kind) => (
            <label className="flex gap-2" key={kind}>
              <input
                checked={source === kind}
                name="source"
                onChange={() => {
                  setSource(kind);
                  setValue("");
                  setReviewed(false);
                }}
                type="radio"
                value={kind}
              />
              {kind === "xml" ? "Paste XML" : "Public URL"}
            </label>
          ))}
        </div>
        <Label htmlFor="cap-import-source">
          {source === "xml" ? "CAP XML" : "Source URL"}
        </Label>
        <Textarea
          className="min-h-40"
          id="cap-import-source"
          onChange={(event) => {
            setValue(event.target.value);
            setReviewed(false);
          }}
          required
          value={value}
        />
        <label className="flex items-start gap-2">
          <input
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
            type="checkbox"
          />
          I have checked the source and will review the saved alert before
          publication.
        </label>
        <Button disabled={!(reviewed && value.trim())} type="submit">
          {busy ? "Importing…" : "Import for review"}
        </Button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
