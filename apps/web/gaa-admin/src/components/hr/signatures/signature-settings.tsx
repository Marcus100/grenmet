"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { type PointerEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteSignature,
  saveSignature,
  signatureKey,
  useSignedDocuments,
  useSigning,
} from "./signature-api";

export function SignatureSettings() {
  const signature = useSigning();
  const queryClient = useQueryClient();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [upload, setUpload] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const documents = useSignedDocuments(page);

  function clear() {
    const surface = canvas.current;
    if (hasInk)
      surface?.getContext("2d")?.clearRect(0, 0, surface.width, surface.height);
    setHasInk(false);
    setUpload(null);
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const surface = event.currentTarget;
    const bounds = surface.getBoundingClientRect();
    return [
      ((event.clientX - bounds.left) * surface.width) / bounds.width,
      ((event.clientY - bounds.top) * surface.height) / bounds.height,
    ];
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (busy) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "black";
    setUpload(null);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || busy) return;
    const [x, y] = point(event);
    const context = event.currentTarget.getContext("2d");
    context?.lineTo(x, y);
    context?.stroke();
    setHasInk(true);
  }

  async function persist(remove = false) {
    const image =
      upload ?? (hasInk ? canvas.current?.toDataURL("image/png") : null);
    if (!(remove || image)) return;
    setBusy(true);
    try {
      if (remove) await deleteSignature();
      else if (image) await saveSignature(image);
      clear();
      await queryClient.invalidateQueries({ queryKey: signatureKey });
      toast.success(remove ? "Saved signature deleted" : "Signature saved");
    } catch {
      toast.error(
        "Unable to update your signature. Use a PNG under 250 KB, up to 2000 × 1000 pixels."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">My signature</h2>
        <p className="text-muted-foreground text-sm">
          Draw or upload your signature. It is applied only when you choose Sign
          &amp; submit. Replacing or deleting it keeps previously signed
          documents intact.
        </p>
        {signature.isPending && <p role="status">Loading signature…</p>}
        {signature.isError && (
          <p role="alert">Unable to load your saved signature.</p>
        )}
        {signature.data && (
          <Image
            alt="Current saved signature"
            className="rounded-md bg-white object-contain"
            height={90}
            src={signature.data.image_data_url}
            unoptimized
            width={240}
          />
        )}
        <p className="text-sm" id="signature-drawing-label">
          Draw your signature below, or upload a PNG using the file control.
        </p>
        <canvas
          aria-describedby="signature-drawing-label"
          aria-label="Draw signature"
          className="h-40 w-full touch-none rounded-md border bg-white"
          height={240}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            drawing.current = false;
          }}
          ref={canvas}
          width={800}
        />
        <label
          className="flex flex-col gap-2 text-sm"
          htmlFor="signature-upload"
        >
          Upload signature (PNG, up to 250 KB)
          <Input
            accept="image/png"
            disabled={busy}
            id="signature-upload"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.type !== "image/png" || file.size > 256_000) {
                setUpload(null);
                toast.error("Choose a PNG file under 250 KB");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") setUpload(reader.result);
              };
              reader.onerror = () =>
                toast.error("Unable to read signature file");
              reader.readAsDataURL(file);
            }}
            type="file"
          />
        </label>
        {upload && (
          <Image
            alt="Signature upload preview"
            className="bg-white object-contain"
            height={90}
            src={upload}
            unoptimized
            width={240}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !(upload || hasInk)}
            onClick={() => persist()}
            type="button"
          >
            {busy ? "Saving…" : "Save signature"}
          </Button>
          <Button
            disabled={busy}
            onClick={clear}
            type="button"
            variant="outline"
          >
            Clear drawing
          </Button>
          {signature.data && (
            <Button
              disabled={busy}
              onClick={() => persist(true)}
              type="button"
              variant="outline"
            >
              Delete saved signature
            </Button>
          )}
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">Signed documents</h2>
        {documents.isPending && <p role="status">Loading signed documents…</p>}
        {documents.isError && (
          <p role="alert">Unable to load signed documents.</p>
        )}
        {documents.data?.count === 0 && (
          <p className="text-muted-foreground text-sm">
            Your signed HR forms will appear here.
          </p>
        )}
        {documents.data?.data.map((document) => (
          <div
            className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm"
            key={document.id}
          >
            <span>
              {document.entity_type.replaceAll("_", " ")} ·{" "}
              {new Date(document.signed_at).toLocaleString()} ·{" "}
              {document.signer_name}
            </span>
            <a
              className="underline"
              href={`/api/v1/hr/signed-documents/${document.id}/pdf`}
            >
              Download signed PDF
            </a>
          </div>
        ))}
        {(documents.data?.count ?? 0) > 20 && (
          <div className="flex gap-2">
            <Button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={page * 20 >= (documents.data?.count ?? 0)}
              onClick={() => setPage(page + 1)}
              variant="outline"
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
