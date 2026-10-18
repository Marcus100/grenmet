import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "About and terms" };

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-gm-heading text-heading-lg">
        About these alerts
      </h1>

      <section aria-labelledby="source" className="space-y-2">
        <h2
          className="font-semibold text-gm-heading text-heading-sm"
          id="source"
        >
          Official source
        </h2>
        <p className="text-body">
          Weather alerts on this site are issued by the Grenada Meteorological
          Service (GMS) for Grenada, Carriacou and Petite Martinique. The GMS
          alone decides when an alert is issued, changed or cancelled. This site
          displays those decisions; it does not make them. Barrels Grenada
          builds and runs the software for the GMS.
        </p>
      </section>

      <section aria-labelledby="subscribe" className="space-y-2">
        <h2
          className="font-semibold text-gm-heading text-heading-sm"
          id="subscribe"
        >
          How to get alerts
        </h2>
        <p className="text-body">
          Email and phone notifications from this site are not available yet.
          Until they are, see how to receive GMS alerts on the{" "}
          <a
            className="text-gm-blue-ink underline"
            href={`${env.GMS_SITE_URL}/alerts/get-alerts`}
          >
            GMS get alerts page
          </a>
          , and follow GMS announcements on local radio and TV.
        </p>
      </section>

      <section aria-labelledby="terms" className="space-y-2">
        <h2
          className="font-semibold text-gm-heading text-heading-sm"
          id="terms"
        >
          Terms of use
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-body">
          <li>
            Alerts are shown as issued. In an emergency, follow instructions
            from local authorities first.
          </li>
          <li>
            This page can be briefly out of date. The time of the last update is
            shown on each page. If the service cannot be reached, the page says
            so; that is never an all-clear.
          </li>
          <li>
            The machine feeds may be used freely by apps and agencies. Please
            keep the Grenada Meteorological Service named as the source.
          </li>
        </ul>
      </section>
    </div>
  );
}
