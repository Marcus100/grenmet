import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import Link from "next/link";
import { env } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="border-gm-border border-t bg-gm-surface text-body-sm text-gm-text-secondary print:border-0">
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-6">
        <p>
          Official source: the{" "}
          <a
            className="font-medium text-gm-blue-ink underline"
            href={env.GMS_SITE_URL}
          >
            Grenada Meteorological Service
          </a>
          . In an emergency, follow instructions from local authorities, radio
          and TV.
        </p>
        <p className="print:hidden">
          <Link className="underline" href="/about">
            About and terms
          </Link>
          {" · "}
          <Link className="underline" href="/feeds">
            Alert feeds
          </Link>
        </p>
        <p className="print:hidden">
          Support, corrections and feedback on this service: Barrels Grenada at{" "}
          <a
            className="font-medium text-gm-blue-ink underline"
            href={BARRELS_SUPPORT_HREF}
          >
            {BARRELS_SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
