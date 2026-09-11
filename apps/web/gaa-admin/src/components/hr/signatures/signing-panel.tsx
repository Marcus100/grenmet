"use client";

import Image from "next/image";
import Link from "next/link";
import type { SubmissionMetadata } from "@/components/hr/submission-date";
import { useSigning } from "./signature-api";

export function SigningPanel({
  submission,
}: {
  submission?: SubmissionMetadata | null;
}) {
  const signature = useSigning();
  if (submission) {
    return (
      <p className="text-sm" role="status">
        Submission saved.{" "}
        {submission.signed_document_id ? (
          <a
            className="underline"
            href={`/api/v1/hr/signed-documents/${submission.signed_document_id}/pdf`}
          >
            Download signed PDF
          </a>
        ) : (
          <span>No signed PDF is recorded for this submission.</span>
        )}
      </p>
    );
  }
  if (signature.isPending) return <p role="status">Loading your signature…</p>;
  if (signature.isError) {
    return (
      <p role="alert">Unable to load your signature. Refresh before signing.</p>
    );
  }
  if (!signature.data) {
    return (
      <p className="text-sm">
        <Link className="underline" href="/profile?tab=signature">
          Save your signature in your profile
        </Link>{" "}
        before signing this form.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="font-medium text-sm">Your signature</p>
      <Image
        alt="Your saved signature"
        className="rounded-md bg-white object-contain"
        height={90}
        src={signature.data.image_data_url}
        unoptimized
        width={240}
      />
      <p className="text-muted-foreground text-xs">
        By selecting Sign &amp; submit, you confirm this form and apply this
        signature to the submitted record.
      </p>
    </div>
  );
}
