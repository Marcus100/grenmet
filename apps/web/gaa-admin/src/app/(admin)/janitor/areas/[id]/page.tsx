import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { ListChecks, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/app/(admin)/_components/panel";
import { AreaEditButton, TaskButton } from "@/components/janitorial/area-forms";
import {
  AppaBadge,
  AwaitingFieldData,
  CadenceBadge,
  InactiveBadge,
  JanitorHeader,
  Kpi,
  SpaceTypeLabel,
} from "@/components/janitorial/portal";
import { QrSymbol } from "@/components/janitorial/qr-labels";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
} from "@/db/janitorial/queries";
import { env } from "@/env";
import {
  APPA_LEVEL_LABELS,
  findArea,
  occurrencesPerDay,
} from "@/lib/janitorial/catalogue";
import { formatFrequency, formatPerDay } from "@/lib/janitorial/format";
import { qrMatrix, qrPayload } from "@/lib/janitorial/qr";

export const metadata: Metadata = {
  title: "Janitorial area",
  description: "Cleaning tasks and service record for one GAA area.",
};

export const dynamic = "force-dynamic";

export default async function JanitorAreaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const areaId = Number(id);
  if (!(Number.isSafeInteger(areaId) && areaId > 0)) notFound();
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const { buildings } = await getJanitorialCatalogue();
  const found = findArea(buildings, areaId);
  if (!found) notFound();
  const { area, building, row, section } = found;
  // Area codes start with their site code, e.g. GND-A0010.
  const site = area.code.slice(0, 3);
  const canEdit = access.canManageCatalogue;
  const location = [building.name, section?.name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          canEdit ? (
            <AreaEditButton area={area} sections={building.sections} />
          ) : null
        }
        crumbs={[
          { href: `/janitor?site=${site}`, label: "Janitorial" },
          { href: `/janitor/areas?site=${site}`, label: "Areas" },
        ]}
        title={area.name}
      >
        {location}
      </JanitorHeader>

      <section aria-label="Area figures" className="grid gap-3 sm:grid-cols-3">
        <Kpi
          hint={`${area.quantity > 1 ? `${area.quantity} units · ` : ""}code ${area.code}`}
          icon={ListChecks}
          label="Scheduled tasks"
          value={String(row.taskCount)}
        />
        <Kpi
          hint="Scheduled task occurrences"
          icon={ListChecks}
          label="Tasks per day"
          value={formatPerDay(row.perDay)}
        />
        <Kpi
          hint={row.fastest ? undefined : "No scheduled tasks"}
          icon={Timer}
          label="Most frequent task"
          value={row.fastest ? formatFrequency(row.fastest) : "—"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel
            description="What the specification requires in this area."
            title="Cleaning tasks"
          >
            {canEdit ? (
              <div className="mb-3 flex justify-end">
                <TaskButton areaId={area.id} task={null} />
              </div>
            ) : null}
            {area.tasks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No individual tasks
                {area.bundles.length > 0
                  ? " — this area is covered by the task bundles below."
                  : "."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Per day</TableHead>
                    {canEdit ? (
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {area.tasks.map((task) => (
                    <TableRow
                      className={
                        task.active ? undefined : "text-muted-foreground"
                      }
                      key={task.id}
                    >
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {task.activity}
                          <InactiveBadge active={task.active} />
                        </span>
                      </TableCell>
                      <TableCell>
                        {task.mode ? (
                          <Badge variant="light-light">{task.mode}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatFrequency(task.frequency)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPerDay(occurrencesPerDay(task.frequency))}
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <TaskButton areaId={area.id} task={task} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          {area.bundles.map((bundle) => (
            <Panel
              description="Shared task bundle used by this area."
              key={bundle.id}
              title={bundle.name}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Per day</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.items.map((item) => (
                    <TableRow key={`${bundle.id}-${item.activity}`}>
                      <TableCell>{item.activity}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatFrequency(item.frequency)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPerDay(occurrencesPerDay(item.frequency))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          ))}
        </div>

        <div className="space-y-4">
          <Panel title="Service level">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {row.active ? "Active" : <InactiveBadge active={false} />}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Space type</dt>
                <dd>
                  <SpaceTypeLabel spaceType={area.spaceType} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Target</dt>
                <dd className="flex items-center gap-2">
                  <AppaBadge level={area.cleanlinessLevel ?? null} />
                  {area.cleanlinessLevel ? (
                    <span className="text-muted-foreground text-xs">
                      {APPA_LEVEL_LABELS[area.cleanlinessLevel]}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Cadence</dt>
                <dd>
                  <CadenceBadge cadence={row.cadence} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Building</dt>
                <dd className="text-right">
                  <Link
                    className="hover:underline"
                    href={`/janitor/areas?site=${site}&building=${building.id}`}
                  >
                    {building.name}
                  </Link>
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel
            action={{
              href: `/janitor/areas/labels?site=${site}&building=${building.id}`,
              label: "Print labels",
            }}
            description="Cleaners scan this to check in."
            title="QR label"
          >
            <div className="flex items-center gap-4">
              <QrSymbol
                className="size-28 shrink-0 rounded-sm"
                qr={qrMatrix(qrPayload(area.code, env.JANITOR_APP_URL))}
                title={`QR code for ${area.code}`}
              />
              <p className="font-mono text-sm">{area.code}</p>
            </div>
          </Panel>
          <Panel title="Recent visits">
            <AwaitingFieldData
              description="Check-ins and completed tasks for this area will be listed here."
              title="No visits yet"
            />
          </Panel>
          <Panel title="Issues & inspections">
            <AwaitingFieldData
              description="Reported problems and supervisor scores for this area will appear here."
              title="Nothing recorded yet"
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
