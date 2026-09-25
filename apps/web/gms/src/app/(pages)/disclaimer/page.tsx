import Link from "next/link";
export const metadata = { title: "About the information on this website" };
export default function InformationPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 pt-3 text-body-base text-gm-text-primary leading-body-base lg:pt-4">
      <h1 className="font-bold text-gm-navy text-heading-md leading-heading-md">
        About the information on this website
      </h1>
      <p>
        Issued products identify their date, time, area and validity. Read those
        details before using or sharing a forecast. A later issue may update the
        assessment.
      </p>
      <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
        Dated examples and current information
      </h2>
      <p>
        Development examples and supplied historical reports are labelled. Their
        figures are not a live observation feed. When a connected product
        service is unavailable, the page says so.
      </p>
      <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
        Forecasts and observations
      </h2>
      <p>
        A forecast describes expected conditions. An observation records
        conditions at a stated place and time. The site keeps these labels
        distinct, including when an older observation is the latest one
        available.
      </p>
      <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
        Questions about a product
      </h2>
      <p>
        Contact GMS with the product name and issue time if the wording or
        validity is unclear.
      </p>
      <Link className="text-gm-blue-ink underline" href="/about/contact">
        Contact GMS
      </Link>
    </article>
  );
}
