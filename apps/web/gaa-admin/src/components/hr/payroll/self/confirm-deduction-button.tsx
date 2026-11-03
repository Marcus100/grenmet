"use client";

import { useHrConfirmMyDeduction } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { PayrollProblem } from "../payroll-states";

export function ConfirmDeductionButton({
  deductionId,
}: {
  deductionId: string;
}) {
  const router = useRouter();
  const confirm = useHrConfirmMyDeduction();
  const [text, setText] = useState<string | null>(null);

  async function onConfirm() {
    setText(null);
    try {
      await confirm.mutateAsync({ path: { deduction_id: deductionId } });
      toast.success("Deduction confirmed");
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected")
        reportError(error, "hr-payroll-confirm-deduction");
      setText(failure.message);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={confirm.isPending}
        onClick={onConfirm}
        size="sm"
        type="button"
      >
        I confirm this deduction
      </Button>
      {text ? <PayrollProblem>{text}</PayrollProblem> : null}
    </div>
  );
}
