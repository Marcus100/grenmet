import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@barrelsgd/ui/components/ui/breadcrumb";
import { Card } from "@barrelsgd/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { RadioTower } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  APPA_LEVEL_LABELS,
  CADENCE_LABELS,
  type Cadence,
  SITE_CODES,
  type SiteCode,
  SPACE_TYPE_LABELS,
  type SpaceType,
} from "@/lib/janitorial/catalogue";

export function JanitorHeader({
  actions,
  children,
  crumbs = [],
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  crumbs?: { href: string; label: string }[];
  title: string;
}) {
  return (
    <header className="space-y-2">
      {crumbs.length > 0 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb) => (
              <BreadcrumbItem key={crumb.href}>
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
                <BreadcrumbSeparator />
              </BreadcrumbItem>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          {children ? (
            <p className="text-muted-foreground text-sm">{children}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

const SITE_NAMES: Record<SiteCode, string> = {
  GND: "MBIA",
  CRU: "Lauriston",
};

/** Airport switcher; keeps the page and swaps only the `site` parameter. */
export function SiteSwitcher({
  current,
  href,
}: {
  current: SiteCode;
  href: (site: SiteCode) => string;
}) {
  return (
    <nav
      aria-label="Airport"
      className="inline-flex rounded-lg border bg-muted p-0.5"
    >
      {SITE_CODES.map((code) => (
        <Link
          aria-current={code === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            code === current
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          href={href(code)}
          key={code}
        >
          {SITE_NAMES[code]}
          <span className="ml-1 font-mono text-muted-foreground text-xs">
            {code}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function Kpi({
  hint,
  icon: Icon,
  label,
  value,
}: {
  hint?: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-1 px-4 py-4">
      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span className="font-medium">{label}</span>
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <p className="font-semibold text-2xl tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </Card>
  );
}

const CADENCE_VARIANT = {
  high: "light-warning",
  daily: "light-info",
  periodic: "light-light",
} as const satisfies Record<Cadence, string>;

export function CadenceBadge({ cadence }: { cadence: Cadence }) {
  return (
    <Badge variant={CADENCE_VARIANT[cadence]}>{CADENCE_LABELS[cadence]}</Badge>
  );
}

export function SpaceTypeLabel({ spaceType }: { spaceType: SpaceType }) {
  return <span>{SPACE_TYPE_LABELS[spaceType]}</span>;
}

/** Target APPA level; level 1 is the strictest standard. */
export function AppaBadge({ level }: { level: number | null }) {
  if (level == null) {
    return <span className="text-muted-foreground text-xs">Not set</span>;
  }
  return (
    <Badge
      title={APPA_LEVEL_LABELS[level]}
      variant={level === 1 ? "light-primary" : "light-light"}
    >
      APPA {level}
    </Badge>
  );
}

export function InactiveBadge({ active }: { active: boolean }) {
  return active ? null : <Badge variant="light-light">Inactive</Badge>;
}

/** Placeholder for monitoring data that arrives once the janitor app is live. */
export function AwaitingFieldData({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadioTower />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
