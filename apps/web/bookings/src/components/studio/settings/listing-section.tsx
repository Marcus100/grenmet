"use client";

import type { BookingBusinessType } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import Image from "next/image";
import { useRef, useState } from "react";
import {
  finishCoverUploadAction,
  startCoverUploadAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import { COVER_ACCEPT, COVER_MAX_LABEL, coverProblem } from "@/lib/brand-cover";
import { logoSrc } from "@/lib/brand-logo";
import { BUSINESS_TYPES, businessTypeLabel } from "@/lib/business-types";
import { reportError } from "@/lib/report-error";
import { SELECT } from "./settings-ui";

const UPLOAD_FAILED = "The upload did not go through. Try again.";

/**
 * How the business is found on the Barrels Bookings home page: its type and a
 * cover photo. Both are saved by the profile form's Save button; the cover is
 * staged in a hidden field once uploaded.
 */
export function ListingSection({
  businessName,
  businessType,
  coverFileId,
  onUploadingChange,
  orgSlug,
}: {
  businessName: string;
  businessType: BookingBusinessType | null;
  coverFileId: string | null;
  /** Tells the host form while a cover photo is in flight, so Save waits for it. */
  onUploadingChange?: (uploading: boolean) => void;
  orgSlug: string;
}) {
  return (
    <fieldset className="border-border space-y-5 border-t pt-4">
      <legend className="pt-4 font-medium">Home page</legend>
      <BusinessTypeField initial={businessType} />
      <CoverPhoto
        businessName={businessName}
        initial={coverFileId}
        onUploadingChange={onUploadingChange}
        orgSlug={orgSlug}
      />
    </fieldset>
  );
}

export function BusinessTypeField({
  initial,
}: {
  initial: BookingBusinessType | null;
}) {
  return (
    <div className="space-y-1">
      <Label className="font-medium" htmlFor="profile-businessType">
        Type of business
      </Label>
      <NativeSelect
        aria-describedby="profile-businessType-hint"
        className={`${SELECT} max-w-xs`}
        defaultValue={initial ?? ""}
        id="profile-businessType"
        name="businessType"
      >
        <NativeSelectOption value="">Not set</NativeSelectOption>
        {BUSINESS_TYPES.map((type) => (
          <NativeSelectOption key={type} value={type}>
            {businessTypeLabel(type)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p
        className="text-muted-foreground text-sm"
        id="profile-businessType-hint"
      >
        Shown on the Barrels Bookings home page so people can find you by type.
      </p>
    </div>
  );
}

function uploadLabel(busy: boolean, fileId: string | null): string {
  if (busy) {
    return "Uploading...";
  }
  return fileId ? "Replace cover photo" : "Upload cover photo";
}

export function CoverPhoto({
  businessName,
  initial,
  onUploadingChange,
  orgSlug,
}: {
  businessName: string;
  initial: string | null;
  onUploadingChange?: (uploading: boolean) => void;
  orgSlug: string;
}) {
  const [fileId, setFileId] = useState(initial);
  const [busy, setBusy] = useState(false);
  const setUploading = (uploading: boolean) => {
    setBusy(uploading);
    onUploadingChange?.(uploading);
  };
  const [message, setMessage] = useState<{
    tone: "error" | "status";
    text: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    const problem = coverProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const started = await startCoverUploadAction(orgSlug, {
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!started.ok) {
        setMessage({ tone: "error", text: started.message });
        return;
      }
      const put = await fetch(started.target.url, {
        method: "PUT",
        headers: started.target.headers,
        body: file,
      });
      if (!put.ok) {
        setMessage({ tone: "error", text: UPLOAD_FAILED });
        return;
      }
      const finished = await finishCoverUploadAction(
        orgSlug,
        started.target.id
      );
      if (!finished.ok) {
        setMessage({ tone: "error", text: finished.message });
        return;
      }
      setFileId(finished.fileId);
      setMessage({
        tone: "status",
        text: "Cover photo uploaded. Save the profile to use it.",
      });
    } catch (error) {
      reportError(error, "studio-cover");
      setMessage({ tone: "error", text: UPLOAD_FAILED });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-medium" id="profile-cover-label">
        Cover photo (optional)
      </p>
      {fileId ? (
        <Image
          alt={`Cover photo of ${businessName}`}
          className="border-border h-32 w-auto max-w-full rounded-md border object-cover"
          height={128}
          src={logoSrc(fileId)}
          unoptimized
          width={256}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No cover photo yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="min-h-11"
          disabled={busy}
          onClick={() => input.current?.click()}
          type="button"
          variant="outline"
        >
          {uploadLabel(busy, fileId)}
        </Button>
        {fileId ? (
          <Button
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              setFileId(null);
              setMessage({
                tone: "status",
                text: "Cover photo removed. Save the profile to apply it.",
              });
            }}
            type="button"
            variant="ghost"
          >
            Remove cover photo
          </Button>
        ) : null}
        <input
          accept={COVER_ACCEPT}
          aria-label="Choose a cover photo"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              upload(file);
            }
          }}
          ref={input}
          tabIndex={-1}
          type="file"
        />
      </div>
      <input name="coverFileId" type="hidden" value={fileId ?? ""} />
      <p className="text-muted-foreground text-sm">
        JPEG, PNG or WebP, up to {COVER_MAX_LABEL}. It fills the top of your
        card on the home page, so a wide photo works best.
      </p>
      {message ? (
        <p
          className={
            message.tone === "error"
              ? "text-destructive text-sm font-medium"
              : "text-muted-foreground text-sm"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
