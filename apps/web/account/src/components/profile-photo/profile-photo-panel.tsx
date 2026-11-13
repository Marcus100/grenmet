"use client";

import {
  type ProfileImagePublic,
  type ProfileImagesSetMineOptions,
  useProfileImagesRemoveMine,
  useProfileImagesSetMine,
} from "@barrelsgd/api-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@barrelsgd/ui/components/ui/avatar";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ChangeEvent, useId, useState } from "react";
import { ensureSameOriginApiClient } from "@/lib/api-client-setup";
import { profilePhotoErrorMessage } from "@/lib/profile-photo-error";
import {
  PROFILE_PHOTO_ACCEPT,
  type ProfilePhotoType,
  profilePhotoProblem,
  profilePhotoType,
} from "@/lib/profile-photo-rules";
import { profilePhotoSrc } from "@/lib/profile-photo-src";

/** Word breaks in a name or an email local part, for the initials. */
const NAME_SEPARATORS = /[\s._-]+/u;

// The browser calls /api/v1/* on this host; the proxy adds the session token.
ensureSameOriginApiClient();

interface ProfilePhotoPanelProps {
  email: string;
  /** Null when the person has no photo, or the photo could not be checked. */
  initialPhoto: ProfileImagePublic | null;
  name: string | null;
  userId: string;
}

interface Notice {
  readonly text: string;
  readonly tone: "error" | "success";
}

/** The upload body, with the Content-Type literal the generated types require. */
function uploadVariables(
  file: File,
  type: ProfilePhotoType
): ProfileImagesSetMineOptions {
  if (type === "image/png") {
    return { body: file, contentType: { request: "image/png" } };
  }
  if (type === "image/webp") {
    return { body: file, contentType: { request: "image/webp" } };
  }
  return { body: file, contentType: { request: "image/jpeg" } };
}

/** Initials for the fallback: first letters of the first two words of the name, else of the email. */
export function initialsFor(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "";
  const words = source.split(NAME_SEPARATORS).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

function PhotoPanel({
  email,
  initialPhoto,
  name,
  userId,
}: ProfilePhotoPanelProps) {
  const [photo, setPhoto] = useState<ProfileImagePublic | null>(initialPhoto);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inputId = useId();
  const upload = useProfileImagesSetMine();
  const remove = useProfileImagesRemoveMine();
  const busy = upload.isPending || remove.isPending;

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the picker so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;

    const problem = profilePhotoProblem(file);
    const type = profilePhotoType(file.type);
    if (problem !== null || type === null) {
      setNotice({ tone: "error", text: problem ?? "Choose a photo." });
      return;
    }

    setNotice(null);
    try {
      const saved = await upload.mutateAsync(uploadVariables(file, type));
      setPhoto(saved);
      setNotice({
        tone: "success",
        text: "Photo saved. People who share an organisation with you can see it now.",
      });
    } catch (error) {
      setNotice({ tone: "error", text: profilePhotoErrorMessage(error) });
    }
  }

  async function onRemove() {
    setNotice(null);
    try {
      await remove.mutateAsync(undefined);
      setPhoto(null);
      setNotice({
        tone: "success",
        text: "Photo removed. Your initials show instead.",
      });
    } catch (error) {
      // 404: there was no photo to remove, so the page is already right.
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404
      ) {
        setPhoto(null);
        return;
      }
      setNotice({ tone: "error", text: profilePhotoErrorMessage(error) });
    }
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <Avatar className="size-24">
        {photo ? (
          <AvatarImage alt="" src={profilePhotoSrc(userId, photo.version)} />
        ) : null}
        <AvatarFallback className="text-lg">
          {initialsFor(name, email)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Field>
          <FieldLabel htmlFor={inputId}>
            {photo ? "Replace photo" : "Upload photo"}
          </FieldLabel>
          <FieldDescription>
            JPEG, PNG or WebP, up to 5 MB. Your photo is cropped square and
            location details are removed.
          </FieldDescription>
          <Input
            accept={PROFILE_PHOTO_ACCEPT}
            className="max-w-sm"
            disabled={busy}
            id={inputId}
            onChange={onChoose}
            type="file"
          />
        </Field>

        {photo ? (
          <div>
            <Button
              disabled={busy}
              onClick={onRemove}
              type="button"
              variant="outline"
            >
              Remove photo
            </Button>
          </div>
        ) : null}

        {busy ? (
          <p className="text-muted-foreground text-sm" role="status">
            Saving…
          </p>
        ) : null}
        {notice ? (
          <p
            className={
              notice.tone === "error" ? "text-destructive text-sm" : "text-sm"
            }
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The panel owns its client cache: only mutations and their results use it (no polling). */
export function ProfilePhotoPanel(props: ProfilePhotoPanelProps) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <PhotoPanel {...props} />
    </QueryClientProvider>
  );
}
