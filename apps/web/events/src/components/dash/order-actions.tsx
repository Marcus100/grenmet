"use client";

import type { OrgOrderDetail } from "@barrelsgd/api-client";
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
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { SIGN_IN_REQUIRED } from "@/data/action-result";
import {
  cancelOrder,
  recordManualPayment,
  refundOrder,
} from "@/data/order-actions";
import { parseMinor } from "@/domain/money";
import {
  COULDNT_CONFIRM,
  cancelOutcomeMessage,
  formatOrderMoneyCode,
  REFUND_CHOICES,
  type RefundChoice,
} from "@/lib/org-orders";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { RefundChoiceGroup } from "./refund-choice";

function Panel({
  children,
  disabledReason,
  title,
}: {
  children: ReactNode;
  disabledReason: string | null;
  title: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display font-semibold text-heading-sm">{title}</h3>
      {disabledReason ? (
        <p className="text-body text-muted-foreground">{disabledReason}</p>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Where a money action reports back. It lives in `OrderActions`, outside the
 * panels, because a successful action refreshes the order and a panel that no
 * longer applies swaps its form for a reason: the outcome must survive that.
 */
interface Report {
  clear: () => void;
  error: (message: string) => void;
  notice: (message: string) => void;
}

interface Failure {
  readonly error: string;
  readonly keepKey: boolean;
}

/** Locks the form after an uncertain failure until the refreshed order arrives. */
function useReloadLock(order: OrgOrderDetail) {
  const [locked, setLocked] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new order object means the page was reloaded
  useEffect(() => setLocked(false), [order]);
  return [locked, setLocked] as const;
}

/**
 * The three money actions on one order. Every panel is always shown; one that
 * cannot apply says why instead of disappearing. Payment and refund send an
 * Idempotency-Key that is kept across a timeout or server fault and rotated
 * after a refusal or a success.
 */
export function OrderActions({ order }: { order: OrgOrderDetail }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report: Report = {
    clear: () => {
      setNotice(null);
      setError(null);
    },
    error: setError,
    notice: setNotice,
  };
  const refundable = order.payment?.refundable_minor ?? 0;
  // The API allows cancelling a confirmed order that never issued tickets.
  const cancellable =
    order.status === "pending_payment" ||
    (order.status === "confirmed" &&
      (order.ticket_count === 0 || order.active_ticket_count > 0));
  let refundReason: string | null = null;
  if (order.refund_status === "queued") {
    refundReason =
      "A card refund is waiting for the payment provider. Reload the page later to see when it is done.";
  } else if (refundable <= 0) {
    refundReason =
      "There is nothing left to refund through the payment system. Outlet cash is refunded from the event's Outlet screen.";
  }
  return (
    <div className="space-y-4">
      <div aria-live="polite" className="space-y-1">
        <p
          className="font-medium text-body text-primary empty:hidden"
          role="status"
        >
          {notice}
        </p>
        <p
          className="font-medium text-body text-destructive empty:hidden"
          role="alert"
        >
          {error}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          disabledReason={
            order.status === "pending_payment"
              ? null
              : "Only an order that is awaiting payment can take a cash or bank payment."
          }
          title="Record manual payment"
        >
          <ManualPaymentForm order={order} report={report} />
        </Panel>
        <Panel disabledReason={refundReason} title="Refund">
          <RefundForm order={order} refundable={refundable} report={report} />
        </Panel>
        <Panel
          disabledReason={
            cancellable ? null : "This order is already cancelled or finished."
          }
          title="Cancel order"
        >
          <CancelOrderForm order={order} report={report} />
        </Panel>
      </div>
    </div>
  );
}

function ManualPaymentForm({
  order,
  report,
}: {
  order: OrgOrderDetail;
  report: Report;
}) {
  const router = useRouter();
  const { pending, perform } = useMemberAction(COULDNT_CONFIRM);
  const { keyFor, rotate } = useIdempotencyKey();
  const [locked, setLocked] = useReloadLock(order);
  const [method, setMethod] = useState<"bank_transfer" | "cash">("cash");
  const [reference, setReference] = useState("");

  function failed(result: Failure) {
    if (result.error !== SIGN_IN_REQUIRED) {
      report.error(result.error);
    }
    if (result.keepKey) {
      // The payment may have been recorded: reload, and keep the same key and
      // body if the person presses the button again.
      setLocked(true);
      router.refresh();
    } else {
      rotate();
    }
  }

  async function submit() {
    report.clear();
    const result = await perform(() =>
      recordManualPayment({
        orderId: order.id,
        idempotencyKey: keyFor(`${method}|${reference.trim()}`),
        method,
        reference,
      })
    );
    if (result.ok) {
      rotate();
      report.notice("Payment recorded. The tickets are issued.");
      router.refresh();
    } else {
      failed(result);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await submit();
      }}
    >
      <p className="text-body text-muted-foreground">
        Use this when you received{" "}
        {formatOrderMoneyCode(order.total_minor, order.currency)} in cash or by
        bank transfer. The order is confirmed and tickets are issued at once.
      </p>
      <div className="flex gap-2">
        {(
          [
            ["cash", "Cash"],
            ["bank_transfer", "Bank transfer"],
          ] as const
        ).map(([value, label]) => (
          <Button
            aria-pressed={method === value}
            className="min-h-11 flex-1"
            disabled={locked}
            key={value}
            onClick={() => setMethod(value)}
            type="button"
            variant={method === value ? "default" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor={`payment-ref-${order.id}`}>
          Reference (optional)
        </FieldLabel>
        <Input
          className="min-h-11"
          disabled={locked}
          id={`payment-ref-${order.id}`}
          maxLength={200}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Receipt or transfer number"
          value={reference}
        />
      </Field>
      <Button className="min-h-11" disabled={pending} type="submit">
        Record payment
      </Button>
      {locked ? (
        <p className="text-caption text-muted-foreground">
          The form is locked until the page reloads. Pressing the button again
          sends the same request.
        </p>
      ) : null}
    </form>
  );
}

function RefundForm({
  order,
  refundable,
  report,
}: {
  order: OrgOrderDetail;
  refundable: number;
  report: Report;
}) {
  const router = useRouter();
  const { pending, perform } = useMemberAction(COULDNT_CONFIRM);
  const { keyFor, rotate } = useIdempotencyKey();
  const [locked, setLocked] = useReloadLock(order);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const partialMinor = mode === "partial" ? parseMinor(amount) : null;
  const amountMinor = mode === "full" ? refundable : partialMinor;
  const code = (minor: number) => formatOrderMoneyCode(minor, order.currency);

  function review() {
    report.clear();
    if (reason.trim().length < 3) {
      setFormError("Give a reason of at least 3 characters.");
      return;
    }
    if (amountMinor === null || amountMinor < 1 || amountMinor > refundable) {
      setFormError(
        `Enter an amount between ${code(1)} and ${code(refundable)}.`
      );
      return;
    }
    setFormError(null);
    setConfirming(true);
  }

  async function confirm() {
    if (amountMinor === null) {
      return;
    }
    report.clear();
    const result = await perform(() =>
      refundOrder({
        orderId: order.id,
        idempotencyKey: keyFor(
          `${mode === "full" ? "all" : amountMinor}|${reason.trim()}`
        ),
        ...(mode === "partial" ? { amountMinor } : {}),
        reason,
        currency: order.currency,
      })
    );
    if (result.ok) {
      rotate();
      setConfirming(false);
      report.notice(
        result.data.refund_status === "queued"
          ? "Refund requested. The card refund is queued with the payment provider."
          : "Refund recorded."
      );
      router.refresh();
      return;
    }
    if (result.error !== SIGN_IN_REQUIRED) {
      report.error(result.error);
    }
    if (result.keepKey) {
      setLocked(true);
      router.refresh();
    } else {
      rotate();
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
    >
      <p className="text-body text-muted-foreground">
        Up to {code(refundable)} can still be refunded. A full refund cancels
        the tickets.
      </p>
      <div className="flex gap-2">
        {(
          [
            ["full", "Full refund"],
            ["partial", "Partial amount"],
          ] as const
        ).map(([value, label]) => (
          <Button
            aria-pressed={mode === value}
            className="min-h-11 flex-1"
            disabled={locked}
            key={value}
            onClick={() => {
              setMode(value);
              setConfirming(false);
            }}
            type="button"
            variant={mode === value ? "default" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "partial" ? (
        <Field>
          <FieldLabel htmlFor={`refund-amount-${order.id}`}>
            Amount to refund ({order.currency})
          </FieldLabel>
          <Input
            className="min-h-11"
            disabled={locked}
            id={`refund-amount-${order.id}`}
            inputMode="decimal"
            onChange={(event) => {
              setAmount(event.target.value);
              setConfirming(false);
            }}
            placeholder="0.00"
            value={amount}
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`refund-reason-${order.id}`}>Reason</FieldLabel>
        <Input
          className="min-h-11"
          disabled={locked}
          id={`refund-reason-${order.id}`}
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            setConfirming(false);
          }}
          value={reason}
        />
      </Field>
      {confirming && amountMinor !== null ? (
        <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
          <p className="font-medium text-body">
            Refund {code(amountMinor)} to the buyer?
          </p>
          <p className="text-caption text-muted-foreground">
            This moves money and can't be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={pending}
              onClick={confirm}
              type="button"
              variant="destructive"
            >
              Confirm refund
            </Button>
            <Button
              className="min-h-11"
              disabled={pending || locked}
              onClick={() => setConfirming(false)}
              type="button"
              variant="outline"
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <Button className="min-h-11" type="submit" variant="outline">
          Review refund
        </Button>
      )}
      {formError ? (
        <p className="text-body text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {locked ? (
        <p className="text-caption text-muted-foreground">
          The form is locked until the page reloads. Confirming again sends the
          same request.
        </p>
      ) : null}
    </form>
  );
}

function CancelOrderForm({
  order,
  report,
}: {
  order: OrgOrderDetail;
  report: Report;
}) {
  const router = useRouter();
  const { pending, perform } = useMemberAction(COULDNT_CONFIRM);
  const outletCash = order.payment_method === "cash_outlet";
  const [refund, setRefund] = useState<RefundChoice>(
    outletCash ? "none" : "follow_policy"
  );
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  async function confirm() {
    report.clear();
    const result = await perform(() =>
      cancelOrder({ orderId: order.id, refund, reason })
    );
    setOpen(false);
    if (result.ok) {
      report.notice(cancelOutcomeMessage(result.data.outcome));
      router.refresh();
      return;
    }
    if (result.error !== SIGN_IN_REQUIRED) {
      report.error(result.error);
    }
    if (result.keepKey) {
      router.refresh();
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
    >
      <RefundChoiceGroup
        disabledValues={outletCash ? ["follow_policy", "full"] : []}
        legend="What happens to the money"
        name={`cancel-refund-${order.id}`}
        onChange={setRefund}
        options={REFUND_CHOICES}
        value={refund}
      />
      {outletCash ? (
        <p className="text-caption text-muted-foreground">
          Cash taken at the outlet is handed back by hand, so only "Do not
          refund" applies. Refund each ticket from the Outlet screen.
        </p>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`cancel-reason-${order.id}`}>
          Reason (optional)
        </FieldLabel>
        <Input
          className="min-h-11"
          id={`cancel-reason-${order.id}`}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <Button
        className="min-h-11"
        disabled={pending}
        type="submit"
        variant="destructive"
      >
        Cancel order
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
          <AlertDialogDescription>
            Its tickets stop working and the seats go back on sale.{" "}
            {
              REFUND_CHOICES.find((choice) => choice.value === refund)
                ?.description
            }
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
