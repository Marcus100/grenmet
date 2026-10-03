import Link from "next/link";
import { PageIntro } from "@/components/editorial";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <PageIntro eyebrow="Page not found" title="We couldn’t find that story.">
        <p>
          The address may be incorrect, or the page may no longer be available.
        </p>
      </PageIntro>
      <Link
        className="inline-flex min-h-11 items-center text-signal-green underline"
        href="/search"
      >
        Search Signal →
      </Link>
    </div>
  );
}
