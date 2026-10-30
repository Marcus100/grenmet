import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-10">
      <h1 className="text-gm-heading text-heading-lg font-semibold">
        Page not found
      </h1>
      <p className="text-body text-gm-text-secondary">
        This page does not exist, or the alert is not in the public record.
      </p>
      <Link
        className="text-gm-blue-ink inline-block font-medium underline"
        href="/"
      >
        Back to active alerts
      </Link>
    </div>
  );
}
