import type { Metadata } from "next";
import { AlertsSection } from "@/components/cap/composer/alerts-section";
import { CapComposer } from "@/components/cap/composer/cap-composer";
import { EditorSection } from "@/components/cap/composer/editor-section";
import { FeedsSection } from "@/components/cap/composer/feeds-section";
import { MapSection } from "@/components/cap/composer/map-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CAP Composer",
  description:
    "Common Alerting Protocol — alerts, map, feeds and the editor for the Grenada Meteorological Service.",
};

export default function CapPage() {
  return (
    <CapComposer
      alerts={<AlertsSection />}
      editor={<EditorSection />}
      feeds={<FeedsSection />}
      map={<MapSection />}
    />
  );
}
