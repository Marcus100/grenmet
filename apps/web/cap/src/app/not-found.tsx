import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-10">
      <h1 className="font-semibold text-gm-heading text-heading-lg">
        Page not found
      </h1>
      <p className="text-body text-gm-text-secondary">
        This page does not exist, or the alert is not in the public record.
      </p>
      <Link
        className="inline-block font-medium text-gm-blue-ink underline"
        href="/"
      >
        Back to active alerts
      </Link>
    </div>
  );
}
