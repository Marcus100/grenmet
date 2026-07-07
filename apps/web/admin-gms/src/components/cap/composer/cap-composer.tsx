"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@grenmet/ui/components/ui/tabs";
import type { ReactNode } from "react";

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
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">CAP Composer</h1>
        <p className="text-muted-foreground text-sm">
          Common Alerting Protocol — alerts, map, public feeds and the editor in
          one place.
        </p>
      </div>

      <Tabs className="flex flex-col gap-4" defaultValue="alerts">
        <TabsList
          className="h-auto w-full justify-start gap-6 border-b"
          variant="line"
        >
          {TABS.map((tab) => (
            <TabsTrigger
              className="pb-2.5 text-base"
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {panels[tab.value]}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
