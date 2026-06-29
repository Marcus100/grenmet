"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { RotateCcw } from "lucide-react";
import { DocumentPreview } from "@/components/document/document-preview";
import { EMPTY_SHIFT, ShiftExchangeDocument } from "./shift-exchange-document";

const FIELDS: {
  name: keyof typeof EMPTY_SHIFT;
  label: string;
  multiline?: boolean;
}[] = [
  { name: "department", label: "Department" },
  { name: "requestingEmployee", label: "Employee Requesting Change" },
  { name: "exchangeEmployee", label: "Employee With Whom Change Is Desired" },
  { name: "dateShiftRequested", label: "Date & Shift Requested for Change" },
  { name: "dateReturnShift", label: "Date of Return Shift" },
  { name: "reason", label: "Reason(s) for Request", multiline: true },
];

export function ShiftExchangeEditor() {
  const form = useForm({ defaultValues: EMPTY_SHIFT });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-lg">
                Shift Exchange Requisition
              </h2>
              <Button
                onClick={() => form.reset()}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw data-icon="inline-start" />
                Reset
              </Button>
            </div>

            <Separator />

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                {FIELDS.map((f) => (
                  <form.Field key={f.name} name={f.name}>
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          {f.label}
                        </FieldLabel>
                        {f.multiline ? (
                          <Textarea
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          />
                        ) : (
                          <Input
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          />
                        )}
                      </Field>
                    )}
                  </form.Field>
                ))}
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Shift Exchange Requisition">
            <ShiftExchangeDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
