"use client";

import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { saveOrganiserLogo } from "@/data/actions";
import { ImageUpload } from "./image-upload";

/**
 * The organiser's logo. Uploading stores the file; this card then attaches it
 * to the organiser (or clears it) straight away.
 */
export function OrganiserLogo({
  initialFileId,
  organisationId,
}: {
  initialFileId: string | null;
  organisationId: string | null;
}) {
  const [fileId, setFileId] = useState(initialFileId);
  const [saved, setSaved] = useState(false);
  const { error, perform } = useMemberAction();

  const change = async (next: string | null) => {
    setSaved(false);
    const result = await perform(() => saveOrganiserLogo(next));
    if (result.ok) {
      setFileId(next);
      setSaved(true);
    }
  };

  return (
    <section
      aria-labelledby="logo-heading"
      className="space-y-2 rounded-2xl border border-border bg-card p-4"
    >
      <h2 className="font-semibold text-body-base" id="logo-heading">
        Logo
      </h2>
      <ImageUpload
        label="Organiser logo"
        onChange={change}
        organisationId={organisationId}
        purpose="organiser-logo"
        value={fileId}
      />
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-caption text-muted-foreground" role="status">
          Logo saved.
        </p>
      ) : null}
    </section>
  );
}
