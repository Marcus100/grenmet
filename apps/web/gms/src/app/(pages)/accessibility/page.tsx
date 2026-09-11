import Link from "next/link";
export const metadata = { title: "Accessibility" };
export default function AccessibilityPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-bold text-3xl">Accessibility</h1>
      <p>
        Our aim is to make weather information understandable and usable across
        devices. Product pages present the issue time, validity and content as
        text.
      </p>
      <h2 className="font-semibold text-xl">Using the site</h2>
      <p>
        Use Tab to move through links and controls, and Enter to activate a
        link. Expandable updates can be opened from their summary. Alert
        severity is stated in words as well as colour.
      </p>
      <h2 className="font-semibold text-xl">Report a barrier</h2>
      <p>
        If a page or control prevents you from getting the information you need,
        tell us the page address, device or browser, and what happened. Include
        the product name and date when relevant.
      </p>
      <Link className="underline" href="/about/contact">
        Report an accessibility issue to GMS
      </Link>
      <p>
        <Link className="underline" href="/sitemap">
          Browse the text sitemap
        </Link>
      </p>
    </article>
  );
}
