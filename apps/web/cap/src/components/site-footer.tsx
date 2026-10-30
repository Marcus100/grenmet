import Link from "next/link";
import { env } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="border-gm-border bg-gm-surface text-body-sm text-gm-text-secondary border-t print:border-0">
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-6">
        <p>
          Official source: the{" "}
          <a
            className="text-gm-blue-ink font-medium underline"
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
      </div>
    </footer>
  );
}
