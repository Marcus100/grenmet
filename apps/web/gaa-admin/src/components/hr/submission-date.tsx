export interface SubmissionMetadata {
  signed_document_id?: string | null;
  status?: string;
  submitted_at?: string | null;
}

export function formatSubmissionDate(
  record?: SubmissionMetadata | null
): string {
  if (record?.status === "DRAFT" || !record) return "Not submitted";
  if (!record.submitted_at) return "Not recorded";
  const date = new Date(record.submitted_at);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function SubmissionDate({
  submission,
}: {
  submission?: SubmissionMetadata | null;
}) {
  return (
    <p className="mb-4 text-sm">
      Date submitted: <span>{formatSubmissionDate(submission)}</span>
    </p>
  );
}
