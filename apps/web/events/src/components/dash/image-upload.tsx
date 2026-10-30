"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { finishUpload, startUpload, type UploadPurpose } from "@/data/actions";
import { IMAGE_RULES, IMAGE_TYPES, storedImageUrl } from "@/lib/stored-image";

function buttonLabel(pending: boolean, value: string | null): string {
  if (pending) {
    return "Uploading…";
  }
  return value ? "Replace image" : "Upload image";
}

/** Why this file cannot be uploaded, or null when it can. */
export function imageProblem(
  file: { size: number; type: string },
  purpose: UploadPurpose
): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }
  const rule = IMAGE_RULES[purpose];
  if (file.size > rule.maxBytes) {
    return `That image is larger than ${rule.label}.`;
  }
  return null;
}

/**
 * Uploads an image straight to storage: the API presigns a PUT scoped to the
 * organisation, the browser sends the file, then the API confirms it. `onChange`
 * receives the stored file id (or null when removed); nothing is attached to the
 * organiser or listing until the parent saves it.
 */
export function ImageUpload({
  label,
  onChange,
  organisationId,
  purpose,
  value,
}: {
  label: string;
  onChange: (fileId: string | null) => void;
  /** Null while the organiser has no platform organisation to store files under. */
  organisationId: string | null;
  purpose: UploadPurpose;
  value: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { error, pending, perform } = useMemberAction();
  const [problem, setProblem] = useState<string | null>(null);

  if (organisationId === null) {
    return (
      <p className="text-caption text-muted-foreground">
        Image uploads need an organiser linked to an organisation.
      </p>
    );
  }

  const upload = async (file: File) => {
    const issue = imageProblem(file, purpose);
    setProblem(issue);
    if (issue) {
      return;
    }
    const target = await perform(() =>
      startUpload(organisationId, {
        contentType: file.type,
        purpose,
        sizeBytes: file.size,
      })
    );
    if (!target.ok) {
      return;
    }
    try {
      const put = await fetch(target.data.url, {
        method: "PUT",
        headers: target.data.headers,
        body: file,
      });
      if (!put.ok) {
        setProblem("The upload did not go through. Try again.");
        return;
      }
    } catch {
      setProblem("The upload did not go through. Try again.");
      return;
    }
    const stored = await perform(() =>
      finishUpload(organisationId, target.data.id)
    );
    if (stored.ok) {
      onChange(stored.data);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <Image
          alt={label}
          className="border-border h-32 w-full max-w-xs rounded-xl border object-cover"
          height={128}
          src={storedImageUrl(value)}
          unoptimized
          width={320}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={pending}
          onClick={() => input.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <ImageIcon data-icon="inline-start" />
          {buttonLabel(pending, value)}
        </Button>
        {value ? (
          <Button
            disabled={pending}
            onClick={() => onChange(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
        <input
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              upload(file);
            }
          }}
          ref={input}
          type="file"
        />
      </div>
      <p className="text-caption text-muted-foreground">
        JPEG, PNG or WebP, up to {IMAGE_RULES[purpose].label}.
      </p>
      {problem || error ? (
        <p className="text-caption text-destructive" role="alert">
          {problem ?? error}
        </p>
      ) : null}
    </div>
  );
}
