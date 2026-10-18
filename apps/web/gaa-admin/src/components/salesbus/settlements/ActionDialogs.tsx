"use client";

import type { LocationPublic, RequisitionPublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  approveRequisition,
  deliverRequisition,
  errorMessage,
  rejectRequisition,
} from "../api";

interface DialogProps {
  onClose: () => void;
  requisition: RequisitionPublic;
}

function useAction(onClose: () => void, success: string) {
  const router = useRouter();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
  });
  async function submit(run: () => Promise<unknown>) {
    setError("");
    try {
      await mutation.mutateAsync(run);
      toast.success(success);
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "Action failed"));
    }
  }
  return { error, pending: mutation.isPending, submit };
}

function Shell({
  children,
  description,
  onClose,
  title,
}: {
  children: React.ReactNode;
  description: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Footer({
  error,
  label,
  onClose,
  pending,
}: {
  error: string;
  label: string;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Close
        </Button>
        <Button disabled={pending} type="submit">
          {label}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ApproveDialog({ onClose, requisition }: DialogProps) {
  const id = useId();
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      requisition.lines.map((line) => [
        line.id,
        String(line.requested_quantity),
      ])
    )
  );
  const [note, setNote] = useState("");
  const { error, pending, submit } = useAction(onClose, "Requisition approved");

  return (
    <Shell
      description="Lower a quantity to approve less than was asked for."
      onClose={onClose}
      title={`Approve ${requisition.reference}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(() =>
            approveRequisition(requisition.id, {
              lines: requisition.lines.map((line) => ({
                line_id: line.id,
                approved_quantity: Number(quantities[line.id]),
              })),
              note: note.trim() || null,
            })
          );
        }}
      >
        {requisition.lines.map((line) => (
          <Field key={line.id}>
            <FieldLabel htmlFor={`${id}-${line.id}`}>
              {line.item_name} (asked {line.requested_quantity} {line.unit})
            </FieldLabel>
            <Input
              id={`${id}-${line.id}`}
              inputMode="numeric"
              max={line.requested_quantity}
              min={0}
              onChange={(e) =>
                setQuantities({ ...quantities, [line.id]: e.target.value })
              }
              required
              type="number"
              value={quantities[line.id]}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            value={note}
          />
        </Field>
        <Footer
          error={error}
          label="Approve"
          onClose={onClose}
          pending={pending}
        />
      </form>
    </Shell>
  );
}

export function RejectDialog({ onClose, requisition }: DialogProps) {
  const id = useId();
  const [note, setNote] = useState("");
  const { error, pending, submit } = useAction(onClose, "Requisition rejected");

  return (
    <Shell
      description="The requester sees your reason."
      onClose={onClose}
      title={`Reject ${requisition.reference}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(() => rejectRequisition(requisition.id, { note }));
        }}
      >
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>Reason</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            required
            rows={3}
            value={note}
          />
        </Field>
        <Footer
          error={error}
          label="Reject"
          onClose={onClose}
          pending={pending}
        />
      </form>
    </Shell>
  );
}

export function DeliverDialog({
  locations,
  onClose,
  requisition,
}: DialogProps & { locations: LocationPublic[] }) {
  const id = useId();
  const active = locations.filter((location) => location.is_active);
  const outstanding = (line: RequisitionPublic["lines"][number]) =>
    (line.approved_quantity ?? 0) - line.delivered_quantity;
  const [locationId, setLocationId] = useState(active[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      requisition.lines.map((line) => [line.id, String(outstanding(line))])
    )
  );
  const [note, setNote] = useState("");
  const { error, pending, submit } = useAction(onClose, "Delivery recorded");

  return (
    <Shell
      description="Stock is taken from the chosen location. Deliver part now and the rest later if you need to."
      onClose={onClose}
      title={`Deliver ${requisition.reference}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(() =>
            deliverRequisition(requisition.id, {
              location_id: locationId,
              lines: requisition.lines
                .filter((line) => Number(quantities[line.id]) > 0)
                .map((line) => ({
                  line_id: line.id,
                  quantity: Number(quantities[line.id]),
                })),
              note: note.trim() || null,
            })
          );
        }}
      >
        <Field>
          <FieldLabel htmlFor={`${id}-location`}>From</FieldLabel>
          <NativeSelect
            id={`${id}-location`}
            onChange={(e) => setLocationId(e.target.value)}
            required
            value={locationId}
          >
            {active.map((location) => (
              <NativeSelectOption key={location.id} value={location.id}>
                {location.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {requisition.lines
          .filter((line) => outstanding(line) > 0)
          .map((line) => (
            <Field key={line.id}>
              <FieldLabel htmlFor={`${id}-${line.id}`}>
                {line.item_name} ({outstanding(line)} {line.unit} to go)
              </FieldLabel>
              <Input
                id={`${id}-${line.id}`}
                inputMode="numeric"
                max={outstanding(line)}
                min={0}
                onChange={(e) =>
                  setQuantities({ ...quantities, [line.id]: e.target.value })
                }
                required
                type="number"
                value={quantities[line.id]}
              />
            </Field>
          ))}
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
          <Input
            id={`${id}-note`}
            maxLength={400}
            onChange={(e) => setNote(e.target.value)}
            value={note}
          />
        </Field>
        <Footer
          error={error}
          label="Record delivery"
          onClose={onClose}
          pending={pending || active.length === 0}
        />
      </form>
    </Shell>
  );
}
