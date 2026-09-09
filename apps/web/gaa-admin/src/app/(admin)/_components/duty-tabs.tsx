"use client";

import type { DashboardPerson } from "@barrelsgd/api-client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { PanelEmpty } from "./panel";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function PeopleList({
  emptyLabel,
  people,
}: {
  emptyLabel: string;
  people: DashboardPerson[];
}) {
  if (people.length === 0) {
    return <PanelEmpty>{emptyLabel}</PanelEmpty>;
  }

  return (
    <ul className="space-y-1">
      {people.map((person) => (
        <li className="flex items-center gap-3 py-1.5" key={person.id}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-[11px] text-primary">
            {initials(person.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {person.shift}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DutyTabs({
  away,
  onDuty,
}: {
  away: DashboardPerson[];
  onDuty: DashboardPerson[];
}) {
  return (
    <Tabs className="w-full flex-col gap-3" defaultValue="on-duty">
      <TabsList className="justify-start">
        <TabsTrigger value="on-duty">On duty ({onDuty.length})</TabsTrigger>
        <TabsTrigger value="away">Away ({away.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="on-duty">
        <PeopleList
          emptyLabel="Nobody is rostered right now."
          people={onDuty}
        />
      </TabsContent>
      <TabsContent value="away">
        <PeopleList emptyLabel="Everyone is in today." people={away} />
      </TabsContent>
    </Tabs>
  );
}
