import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabsList } from "@/components/ui/page-tabs";

const TABS = [
  { value: "alerts", label: "Alerts" },
  { value: "map", label: "Map" },
  { value: "feeds", label: "Feeds" },
  { value: "editor", label: "Editor" },
] as const;

/**
 * Consolidated CAP surface. Each section is server-rendered on the page and
 * passed in as a node, so the tabs just switch between the four surfaces.
 */
export function CapComposer({
  alerts,
  editor,
  feeds,
  map,
}: {
  alerts: ReactNode;
  editor: ReactNode;
  feeds: ReactNode;
  map: ReactNode;
}) {
  const panels: Record<string, ReactNode> = { alerts, map, feeds, editor };

  return (
    <div className="space-y-6">
      <PageHeader
        description="Common Alerting Protocol — alerts, map, public feeds and the editor in one place."
        title="CAP Composer"
      />

      <Tabs className="flex flex-col gap-4" defaultValue="alerts">
        <PageTabsList className="gap-6">
          {TABS.map((tab) => (
            <TabsTrigger
              className="pb-2.5 text-base"
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </PageTabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {panels[tab.value]}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
