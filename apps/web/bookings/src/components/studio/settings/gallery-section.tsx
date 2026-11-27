"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import Image from "next/image";
import { useRef, useState } from "react";
import {
  addGalleryPhotoAction,
  finishGalleryUploadAction,
  type GalleryResult,
  loadGalleryAction,
  removeGalleryPhotoAction,
  reorderGalleryAction,
  startGalleryUploadAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import { logoSrc } from "@/lib/brand-logo";
import {
  GALLERY_ACCEPT,
  GALLERY_MAX_LABEL,
  GALLERY_MAX_PHOTOS,
  type GalleryPhotoView,
  galleryPhotoProblem,
  moved,
} from "@/lib/gallery-photo";
import { reportError } from "@/lib/report-error";

const UPLOAD_FAILED = "The upload did not go through. Try again.";

/**
 * Photographs of the business's work, in the Profile section beside the cover
 * photo. The upload is the cover photo's three steps (presigned PUT, confirm,
 * then save); unlike the cover, a photograph is its own record, so adding,
 * moving and removing save straight away and the wording says so.
 *
 * Members see the photographs and no buttons; the action and the API refuse
 * them again anyway.
 */
export function GallerySection({
  businessName,
  editable,
  orgSlug,
  photos: initial,
}: {
  businessName: string;
  editable: boolean;
  orgSlug: string;
  photos: readonly GalleryPhotoView[];
}) {
  const [photos, setPhotos] = useState<GalleryPhotoView[]>([...initial]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "status";
    text: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = photos.length >= GALLERY_MAX_PHOTOS;

  /**
   * A refused write leaves this list guessing: a photograph someone else removed
   * makes the whole reorder 404. Read the stored gallery back, so the person sees
   * what is really there under the refusal.
   */
  const apply = async (result: GalleryResult, done: string): Promise<void> => {
    if (result.ok) {
      setPhotos(result.photos);
      setMessage({ tone: "status", text: done });
      return;
    }
    setMessage({ tone: "error", text: result.message });
    const stored = await loadGalleryAction(orgSlug);
    if (stored.ok) {
      setPhotos(stored.photos);
    }
  };

  const upload = async (file: File) => {
    const problem = galleryPhotoProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const started = await startGalleryUploadAction(orgSlug, {
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
      const finished = await finishGalleryUploadAction(
        orgSlug,
        started.target.id
      );
      if (!finished.ok) {
        setMessage({ tone: "error", text: finished.message });
        return;
      }
      await apply(
        await addGalleryPhotoAction(orgSlug, finished.fileId),
        "Photograph added. It is on your booking page now."
      );
    } catch (error) {
      reportError(error, "studio-gallery");
      setMessage({ tone: "error", text: UPLOAD_FAILED });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, by: -1 | 1) => {
    const wanted = moved(photos, index, by);
    setBusy(true);
    setMessage(null);
    try {
      await apply(
        await reorderGalleryAction(
          orgSlug,
          wanted.map((photo) => photo.id)
        ),
        "New order saved."
      );
    } catch (error) {
      reportError(error, "studio-gallery");
      setMessage({ tone: "error", text: UPLOAD_FAILED });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: GalleryPhotoView) => {
    setBusy(true);
    setMessage(null);
    try {
      await apply(
        await removeGalleryPhotoAction(orgSlug, photo.id),
        "Photograph removed."
      );
    } catch (error) {
      reportError(error, "studio-gallery");
      setMessage({ tone: "error", text: UPLOAD_FAILED });
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="border-border space-y-3 border-t pt-4">
      <legend className="pt-4 font-medium">Photos of your work</legend>
      <p className="text-muted-foreground text-sm">
        Up to {GALLERY_MAX_PHOTOS} photographs, shown as a row customers swipe
        through above your services. JPEG, PNG or WebP, each up to{" "}
        {GALLERY_MAX_LABEL}.{" "}
        {editable
          ? "Adding, moving and removing save straight away."
          : "Only an owner or admin can change these photographs."}
      </p>
      {photos.length === 0 ? (
        <p className="text-muted-foreground text-sm">No photographs yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {photos.map((photo, index) => (
            <li className="space-y-1" key={photo.id}>
              <Image
                alt={`Photograph ${index + 1} of the work of ${businessName}`}
                className="border-border h-28 w-28 rounded-xl border object-cover"
                height={112}
                src={logoSrc(photo.fileId)}
                unoptimized
                width={112}
              />
              {editable ? (
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Move photograph ${index + 1} earlier`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <span aria-hidden="true">&larr;</span>
                  </Button>
                  <Button
                    aria-label={`Move photograph ${index + 1} later`}
                    disabled={busy || index === photos.length - 1}
                    onClick={() => move(index, 1)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <span aria-hidden="true">&rarr;</span>
                  </Button>
                  <Button
                    aria-label={`Remove photograph ${index + 1}`}
                    disabled={busy}
                    onClick={() => remove(photo)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <span aria-hidden="true">&times;</span>
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="min-h-11"
            disabled={busy || full}
            onClick={() => input.current?.click()}
            type="button"
            variant="outline"
          >
            {busy ? "Working..." : "Add a photograph"}
          </Button>
          {full ? (
            <p className="text-muted-foreground text-sm">
              That is all {GALLERY_MAX_PHOTOS}. Remove one to add another.
            </p>
          ) : null}
          <input
            accept={GALLERY_ACCEPT}
            aria-label="Choose a photograph of your work"
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
      ) : null}
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
    </fieldset>
  );
}
