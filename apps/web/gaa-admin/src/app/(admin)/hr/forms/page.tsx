import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Card, CardContent } from "@barrelsgd/ui/components/ui/card";
import type { Metadata, Route } from "next";
import Link from "next/link";
import {
  type NewRequestItem,
  newRequestItems,
} from "@/components/hr/dashboard/dashboard-data";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "HR Forms",
  description:
    "Every HR form in one place — approval-bound requests and self-filed records.",
};

const SECTIONS: Array<{
  description: string;
  group: NewRequestItem["group"];
  title: string;
}> = [
  {
    group: "request",
    title: "Requests",
    description: "Submitted for approval, then routed to HR.",
  },
  {
    group: "record",
    title: "Records",
    description: "Filed by you as a record — no approval step.",
  },
];

export default function HrFormsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Fill in a form, submit it, and print the signed copy. Submissions appear under each form and on the HR dashboard."
        title="HR Forms"
      />

      {SECTIONS.map((section) => (
        <section className="space-y-3" key={section.group}>
          <div>
            <h2 className="text-base font-medium">{section.title}</h2>
            <p className="text-muted-foreground text-sm">
              {section.description}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {newRequestItems
              .filter((item) => item.group === section.group)
              .map((item) => (
                <FormCard item={item} key={item.id} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FormCard({ item }: { item: NewRequestItem }) {
  const Icon = item.icon;

  return (
    <Link
      className="group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
      href={item.href as Route}
    >
      <Card className="group-hover:border-primary/40 h-full gap-0 py-4 transition-colors">
        <CardContent className="px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <Icon className="size-5" />
            </div>
            <Badge variant="secondary">
              {item.group === "request" ? "Approval" : "Record"}
            </Badge>
          </div>
          <div className="mt-2.5 text-sm font-medium">{item.title}</div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {item.description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
