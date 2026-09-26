"use client";

import type {
  TimetableTripView,
  TimetableVersionDetail,
  TransportAccess,
  TransportCatalogue,
} from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Card } from "@barrelsgd/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  groupTrips,
  hasBlockingIssues,
  issuesByTrip,
} from "@/lib/transport/timetable";
import {
  discardDraft,
  errorMessage,
  publishDraft,
  removeTrip,
  saveDraftDetails,
} from "./api";
import { IssueList } from "./portal";
import { TimetableView } from "./timetable-view";
import { TripDialog } from "./trip-dialog";

/** Today's calendar date in Grenada, as the API judges "today". */
export function grenadaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
  }).format(now);
}

type TripTarget =
  | { kind: "new"; routeId: number }
  | { kind: "edit"; trip: TimetableTripView };

export function DraftEditor({
  access,
  catalogue,
  detail,
}: {
  access: TransportAccess;
  catalogue: TransportCatalogue;
  detail: TimetableVersionDetail;
}) {
  const router = useRouter();
  const id = useId();
  const versionId = detail.version.id;
  const [tripTarget, setTripTarget] = useState<TripTarget | null>(null);
  const [removing, setRemoving] = useState<TimetableTripView | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(grenadaToday);
  const [details, setDetails] = useState({
    label: detail.version.label,
    notes: detail.version.notes ?? "",
    sourceRef: detail.version.sourceRef ?? "",
  });
  const [publishError, setPublishError] = useState("");

  const detailsMutation = useMutation({
    mutationFn: () =>
      saveDraftDetails(versionId, {
        label: details.label,
        notes: details.notes || null,
        sourceRef: details.sourceRef || null,
      }),
    onSuccess: () => {
      toast.success("Draft details saved");
      router.refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save the draft details")),
  });
  const removeMutation = useMutation({
    mutationFn: (tripId: number) => removeTrip(versionId, tripId),
    onSuccess: () => {
      toast.success("Trip removed");
      router.refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not remove the trip")),
  });
  const publishMutation = useMutation({
    mutationFn: () => publishDraft(versionId, { effectiveDate }),
  });
  const discardMutation = useMutation({
    mutationFn: () => discardDraft(versionId),
    onSuccess: () => {
      toast.success("Draft discarded");
      router.push("/bus/timetable");
      router.refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not discard the draft")),
  });

  const groups = groupTrips(detail.trips, catalogue, { includeEmpty: true });
  const tripIssues = issuesByTrip(detail.issues);
  const blocked = hasBlockingIssues(detail.issues);
  const versionIssues = detail.issues.filter((issue) => issue.tripId == null);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setPublishError("");
    try {
      await publishMutation.mutateAsync();
      setPublishing(false);
      toast.success("Timetable published");
      router.refresh();
    } catch (error) {
      setPublishError(errorMessage(error, "Could not publish the timetable"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 p-4">
          <h2 className="font-semibold">Draft details</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              detailsMutation.mutate();
            }}
          >
            <Field className="w-72">
              <FieldLabel htmlFor={`${id}-label`}>Name</FieldLabel>
              <Input
                id={`${id}-label`}
                maxLength={200}
                onChange={(e) =>
                  setDetails({ ...details, label: e.target.value })
                }
                required
                value={details.label}
              />
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor={`${id}-source`}>Source document</FieldLabel>
              <Input
                id={`${id}-source`}
                maxLength={200}
                onChange={(e) =>
                  setDetails({ ...details, sourceRef: e.target.value })
                }
                placeholder="e.g. HR memo 2026-14"
                value={details.sourceRef}
              />
            </Field>
            <Field className="w-full">
              <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
              <Textarea
                id={`${id}-notes`}
                onChange={(e) =>
                  setDetails({ ...details, notes: e.target.value })
                }
                rows={2}
                value={details.notes}
              />
            </Field>
            <Button
              disabled={detailsMutation.isPending}
              type="submit"
              variant="outline"
            >
              Save details
            </Button>
          </form>
        </Card>

        <Card className="gap-3 p-4">
          <h2 className="font-semibold">Ready to publish?</h2>
          {detail.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No issues found.</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {blocked
                ? "Fix the blocking issues before publishing."
                : "Warnings don't block publishing."}
            </p>
          )}
          <IssueList issues={versionIssues} />
          <div className="flex flex-wrap gap-2">
            {access.canPublishTimetable ? (
              <Button disabled={blocked} onClick={() => setPublishing(true)}>
                Publish…
              </Button>
            ) : (
              <p className="text-muted-foreground text-xs">
                A Transport officer publishes timetables.
              </p>
            )}
            <Button onClick={() => setDiscarding(true)} variant="ghost">
              Discard draft
            </Button>
          </div>
        </Card>
      </div>

      <TimetableView
        calendars={catalogue.calendars}
        groups={groups}
        issues={tripIssues}
        routeActions={(group) => (
          <Button
            onClick={() =>
              setTripTarget({ kind: "new", routeId: group.route.id })
            }
            size="sm"
            variant="outline"
          >
            <Plus /> Add trip
          </Button>
        )}
        tripActions={(trip) => (
          <>
            <Button
              onClick={() => setTripTarget({ kind: "edit", trip })}
              size="sm"
              variant="outline"
            >
              <Pencil /> Edit
            </Button>
            <Button onClick={() => setRemoving(trip)} size="sm" variant="ghost">
              <Trash2 /> Remove
            </Button>
          </>
        )}
      />

      {tripTarget ? (
        <TripDialog
          catalogue={catalogue}
          key={tripTarget.kind === "edit" ? tripTarget.trip.id : "new"}
          onOpenChange={(open) => {
            if (!open) setTripTarget(null);
          }}
          onSaved={() => {
            toast.success("Trip saved");
            router.refresh();
          }}
          open
          routeId={tripTarget.kind === "new" ? tripTarget.routeId : null}
          trip={tripTarget.kind === "edit" ? tripTarget.trip : null}
          versionId={versionId}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove this trip?</AlertDialogTitle>
          <AlertDialogDescription>
            It is removed from this draft only. The timetable in force is not
            affected.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) removeMutation.mutate(removing.id);
                setRemoving(null);
              }}
            >
              Remove trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setDiscarding} open={discarding}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            The draft is kept for reference but can no longer be edited or
            published. You can start a new draft afterwards.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => discardMutation.mutate()}>
              Discard draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setPublishing} open={publishing}>
        <DialogContent>
          <form className="space-y-4" onSubmit={publish}>
            <DialogHeader>
              <DialogTitle>Publish timetable</DialogTitle>
              <DialogDescription>
                Drivers and staff see this timetable from the effective date.
                Until then the current timetable stays in force.
              </DialogDescription>
            </DialogHeader>
            <Field className="w-44">
              <FieldLabel htmlFor={`${id}-effective`}>
                Effective from
              </FieldLabel>
              <Input
                id={`${id}-effective`}
                min={grenadaToday()}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
                type="date"
                value={effectiveDate}
              />
            </Field>
            {publishError ? (
              <p className="text-destructive text-sm" role="alert">
                {publishError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                onClick={() => setPublishing(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={publishMutation.isPending} type="submit">
                {publishMutation.isPending ? "Publishing…" : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
