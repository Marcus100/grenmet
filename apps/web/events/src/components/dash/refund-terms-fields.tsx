import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { TriangleAlert } from "lucide-react";
import {
  clampCutoffHours,
  NO_REFUND_WARNING,
  REFUND_DEADLINE_LABELS,
  REFUND_DEADLINES,
  type RefundDeadline,
  STRICTER_TERMS_HINT,
} from "@/lib/refund-terms";
import type { RefundDraft } from "./event-draft";

const MAX_PERCENT = 100;

/**
 * The organiser's refund terms for a ticketed event: refunds allowed or not, the
 * deadline before the start, and an optional cancellation fee. Hidden details
 * are kept in the draft, so saving never drops them.
 */
export function RefundTermsFields({
  onChange,
  value,
}: {
  onChange: (patch: Partial<RefundDraft>) => void;
  value: RefundDraft;
}) {
  const noRefunds = value.refundPolicy === "no_refunds";
  return (
    <fieldset className="space-y-4">
      <legend className="text-body font-medium">Refunds</legend>
      <Field>
        <FieldLabel htmlFor="ed-refund-policy">Refunds allowed</FieldLabel>
        <NativeSelect
          className="w-full"
          id="ed-refund-policy"
          onChange={(e) =>
            onChange({
              refundPolicy:
                e.target.value === "no_refunds" ? "no_refunds" : "refundable",
            })
          }
          value={value.refundPolicy}
        >
          <NativeSelectOption value="refundable">
            Refunds allowed
          </NativeSelectOption>
          <NativeSelectOption value="no_refunds">No refunds</NativeSelectOption>
        </NativeSelect>
      </Field>
      {noRefunds ? (
        <p className="text-body flex gap-2" role="status">
          <TriangleAlert
            aria-hidden="true"
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          {NO_REFUND_WARNING}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ed-refund-deadline">
                Refund deadline
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="ed-refund-deadline"
                onChange={(e) => {
                  const deadline = REFUND_DEADLINES.find(
                    (name) => name === e.target.value
                  );
                  onChange({
                    refundDeadline: deadline ?? value.refundDeadline,
                  });
                }}
                value={value.refundDeadline}
              >
                {REFUND_DEADLINES.map((deadline: RefundDeadline) => (
                  <NativeSelectOption key={deadline} value={deadline}>
                    {REFUND_DEADLINE_LABELS[deadline]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Buyers can ask you for a refund until this long before the
                start.
              </FieldDescription>
            </Field>
            {value.refundDeadline === "custom" ? (
              <Field>
                <FieldLabel htmlFor="ed-refund-hours">
                  Custom deadline (hours)
                </FieldLabel>
                <Input
                  id="ed-refund-hours"
                  max={720}
                  min={0}
                  onChange={(e) =>
                    onChange({
                      refundCustomHours: clampCutoffHours(
                        Number(e.target.value)
                      ),
                    })
                  }
                  type="number"
                  value={value.refundCustomHours}
                />
                <FieldDescription>0 to 720 hours (30 days).</FieldDescription>
              </Field>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ed-fee-type">Cancellation fee</FieldLabel>
              <NativeSelect
                className="w-full"
                id="ed-fee-type"
                onChange={(e) =>
                  onChange({
                    cancellationFeeType:
                      e.target.value === "fixed" || e.target.value === "percent"
                        ? e.target.value
                        : "none",
                  })
                }
                value={value.cancellationFeeType}
              >
                <NativeSelectOption value="none">None</NativeSelectOption>
                <NativeSelectOption value="fixed">
                  Fixed per ticket (EC$)
                </NativeSelectOption>
                <NativeSelectOption value="percent">
                  Percentage of the amount paid
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            {value.cancellationFeeType === "none" ? null : (
              <Field>
                <FieldLabel htmlFor="ed-fee-amount">
                  {value.cancellationFeeType === "fixed"
                    ? "Fee per ticket (EC$)"
                    : "Fee (%)"}
                </FieldLabel>
                <Input
                  id="ed-fee-amount"
                  max={
                    value.cancellationFeeType === "percent"
                      ? MAX_PERCENT
                      : undefined
                  }
                  min={0}
                  onChange={(e) =>
                    onChange({
                      cancellationFeeAmount: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    })
                  }
                  step={value.cancellationFeeType === "fixed" ? "0.01" : 1}
                  type="number"
                  value={value.cancellationFeeAmount}
                />
              </Field>
            )}
          </div>
        </>
      )}
      <FieldDescription>{STRICTER_TERMS_HINT}</FieldDescription>
    </fieldset>
  );
}
