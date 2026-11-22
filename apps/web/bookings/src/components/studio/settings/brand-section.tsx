"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import Image from "next/image";
import { useRef, useState } from "react";
import {
  finishLogoUploadAction,
  startLogoUploadAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import {
  type BrandColourCheck,
  checkBrandColour,
  MIN_CONTRAST,
  NAVY,
} from "@/lib/brand-colour";
import {
  LOGO_ACCEPT,
  LOGO_MAX_LABEL,
  logoProblem,
  logoSrc,
} from "@/lib/brand-logo";
import { reportError } from "@/lib/report-error";
import { INPUT } from "./settings-ui";

const UPLOAD_FAILED = "The upload did not go through. Try again.";

/**
 * The business's accent colour and logo, used in the emails customers get about
 * their bookings. Both are saved by the profile form's Save button: the colour
 * is a field there, and the logo is staged in a hidden field once uploaded.
 */
export function BrandSection({
  businessName,
  brandColour,
  logoFileId,
  orgSlug,
}: {
  businessName: string;
  brandColour: string | null;
  logoFileId: string | null;
  orgSlug: string;
}) {
  return (
    <fieldset className="border-border space-y-5 border-t pt-4">
      <legend className="pt-4 font-medium">Brand</legend>
      <p className="text-muted-foreground text-sm">
        Your colour and logo appear at the top and on the buttons of the emails
        customers get about their bookings. Save the profile to keep changes.
      </p>
      <BrandColour initial={brandColour ?? ""} />
      <BrandLogo
        businessName={businessName}
        initial={logoFileId}
        orgSlug={orgSlug}
      />
    </fieldset>
  );
}

function uploadLabel(busy: boolean, fileId: string | null): string {
  if (busy) {
    return "Uploading...";
  }
  return fileId ? "Replace logo" : "Upload logo";
}

function colourMessage(check: BrandColourCheck): string {
  switch (check.kind) {
    case "empty":
      return "No colour set. Emails use the Barrels navy.";
    case "invalid":
      return "Use a colour like #0b63ee: a # and six hex digits (0 to 9, a to f).";
    case "pass":
      return `Contrast with white text is ${check.ratio}:1. Emails use this colour.`;
    default:
      return `This colour is too pale for white text (${check.ratio}:1; ${MIN_CONTRAST}:1 is needed). Emails will use the Barrels navy (${NAVY}) instead.`;
  }
}

export function BrandColour({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const check = checkBrandColour(text);
  const message = colourMessage(check);
  // The native picker only takes a six-digit colour; show the navy it would fall
  // back to while the text is empty or incomplete.
  const pickerValue =
    check.kind === "pass" || check.kind === "fallback" ? check.hex : NAVY;
  return (
    <div className="space-y-2">
      <Label className="font-medium" htmlFor="profile-brandColour">
        Accent colour (optional)
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Pick the accent colour"
          className="border-border size-11 cursor-pointer rounded-md border p-1"
          onChange={(event) => setText(event.target.value)}
          type="color"
          value={pickerValue}
        />
        <Input
          aria-describedby="profile-brandColour-message"
          aria-invalid={check.kind === "invalid" ? true : undefined}
          autoCapitalize="none"
          autoComplete="off"
          className={`${INPUT} w-36 font-mono`}
          id="profile-brandColour"
          maxLength={7}
          name="brandColor"
          onChange={(event) => setText(event.target.value.trim())}
          placeholder="#0b63ee"
          spellCheck={false}
          value={text}
        />
        <Button
          className="min-h-11"
          disabled={text === ""}
          onClick={() => setText("")}
          type="button"
          variant="ghost"
        >
          Clear colour
        </Button>
      </div>
      <p
        aria-live="polite"
        className={
          check.kind === "fallback" || check.kind === "invalid"
            ? "text-destructive text-sm font-medium"
            : "text-muted-foreground text-sm"
        }
        id="profile-brandColour-message"
      >
        {message}
      </p>
    </div>
  );
}

export function BrandLogo({
  businessName,
  initial,
  orgSlug,
}: {
  businessName: string;
  initial: string | null;
  orgSlug: string;
}) {
  const [fileId, setFileId] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "status";
    text: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    const problem = logoProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const started = await startLogoUploadAction(orgSlug, {
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
      const finished = await finishLogoUploadAction(orgSlug, started.target.id);
      if (!finished.ok) {
        setMessage({ tone: "error", text: finished.message });
        return;
      }
      setFileId(finished.fileId);
      setMessage({
        tone: "status",
        text: "Logo uploaded. Save the profile to use it.",
      });
    } catch (error) {
      reportError(error, "studio-logo");
      setMessage({ tone: "error", text: UPLOAD_FAILED });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-medium" id="profile-logo-label">
        Logo (optional)
      </p>
      {fileId ? (
        <Image
          alt={businessName}
          className="border-border h-24 w-auto max-w-xs rounded-md border object-contain p-2"
          height={96}
          src={logoSrc(fileId)}
          unoptimized
          width={320}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No logo yet.</p>
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
                text: "Logo removed. Save the profile to apply it.",
              });
            }}
            type="button"
            variant="ghost"
          >
            Remove logo
          </Button>
        ) : null}
        <input
          accept={LOGO_ACCEPT}
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
          type="file"
        />
      </div>
      <input name="logoFileId" type="hidden" value={fileId ?? ""} />
      <p className="text-muted-foreground text-sm">
        JPEG, PNG or WebP, up to {LOGO_MAX_LABEL}. An SVG logo must be exported
        to PNG first; a transparent background is kept.
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
