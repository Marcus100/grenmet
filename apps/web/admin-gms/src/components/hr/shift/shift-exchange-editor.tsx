"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { Printer, RotateCcw } from "lucide-react";
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
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  Shift Exchange Requisition
                </h2>
                <div className="flex gap-2">
                  <Button
                    onClick={() => form.reset()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </Button>
                  <Button
                    onClick={() => window.print()}
                    size="sm"
                    type="button"
                  >
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </div>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                {FIELDS.map((f) => (
                  <form.Field key={f.name} name={f.name}>
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>{f.label}</Label>
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
                      </div>
                    )}
                  </form.Field>
                ))}
              </form>
            </CardContent>
          </Card>

          <ShiftExchangeDocument values={values} />
        </div>
      )}
    </form.Subscribe>
  );
}
